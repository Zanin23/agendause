#!/usr/bin/env node
/* ============================================================================
   Testes da migração 20261013140000_admin_contas_sem_edge_function.sql
   num PostgreSQL real (PGlite = Postgres em WebAssembly).

   O schema de apoio imita o que o Supabase já tem: schema auth (users,
   identities, auth.uid()), schema extensions (pgcrypto) e as tabelas públicas
   de perfil/papel/workspaces. O PGlite não traz o pgcrypto, então os testes
   usam um crypt/gen_salt de mentira com o MESMO formato do bcrypt
   ($2a$10$...) — serve para provar o fluxo e que o hash gravado é verificável;
   o bcrypt de verdade continua sendo o do pgcrypto no Supabase.

   O que é conferido:
     1. sem sessão / sessão de quem não é admin → recusa (42501);
     2. criar conta grava auth.users + auth.identities + profiles +
        workspace_members + user_roles, com e-mail confirmado;
     3. a senha gravada confere com crypt() (login funciona) e não fica em claro;
     4. e-mail repetido, e-mail inválido e senha curta → erro claro, sem gravar;
     5. criar como admin não guarda permissões; criar como member guarda;
     6. definir senha troca o hash e recusa conta inexistente;
     7. tornar/remover admin, inclusive a proteção do próprio acesso;
     8. salvar permissões não apaga o papel admin;
     9. anon não executa nada disso; authenticated executa;
    10. rodar a migração duas vezes não quebra (idempotente).

   Como rodar:
     npm install --no-save @electric-sql/pglite
     node scripts/testes/admin-contas-sql.mjs

   Se o PGlite não estiver instalado, o script avisa e sai sem erro.
   ============================================================================ */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const pglite = await import("@electric-sql/pglite").catch(() => null);
if (!pglite) {
  console.log(
    "PGlite não encontrado. Rode antes:\n  npm install --no-save @electric-sql/pglite\n" +
      "e depois:\n  node scripts/testes/admin-contas-sql.mjs",
  );
  process.exit(0);
}

const migracao = readFileSync(
  resolve(RAIZ, "supabase/migrations/20261013140000_admin_contas_sem_edge_function.sql"),
  "utf8",
);

/* ---- o ambiente mínimo que as funções administrativas enxergam ---- */
const SHIM = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;

-- auth.uid() lê a sessão simulada (no Supabase vem do JWT)
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text not null default '',
  confirmation_sent_at timestamptz,
  recovery_token text not null default '',
  recovery_sent_at timestamptz,
  email_change_token_new text not null default '',
  email_change text not null default '',
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone text,
  phone_confirmed_at timestamptz,
  banned_until timestamptz,
  -- coluna gerada, como no GoTrue: ninguém pode inserir nela
  confirmed_at timestamptz generated always as (email_confirmed_at) stored
);

create table auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  id uuid primary key default gen_random_uuid(),
  email text generated always as (lower(identity_data ->> 'email')) stored,
  unique (provider_id, provider)
);

create type public.app_role as enum ('admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  active_workspace_id uuid
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null
);
insert into public.workspaces (slug, name) values ('implantacao', 'Implantação'), ('waldemar', 'Waldemar');

alter table public.profiles
  add constraint profiles_active_workspace_fk foreign key (active_workspace_id) references public.workspaces(id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  screen_permissions jsonb default '[]'::jsonb,
  schedule_permissions jsonb default '{}'::jsonb,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
`;

/* pgcrypto (de mentira), no schema `extensions` como no Supabase Cloud:
   mesmo formato do bcrypt ($2a$10$ + 8 do salt + 32 do hash), para o teste
   poder conferir que o hash gravado é verificável. */
const PGCryptoEmExtensions = `
create schema if not exists extensions;
create or replace function extensions.gen_salt(_tipo text) returns text language sql as $$
  select '$2a$10$' || substr(md5(random()::text), 1, 8)
$$;
create or replace function extensions.crypt(_senha text, _salt text) returns text language plpgsql as $$
declare
  _base text := substr(_salt, 1, 15);
begin
  if _base !~ '^\\$2a\\$10\\$' then
    raise exception 'salt inválido';
  end if;
  return _base || md5(_base || ':' || _senha);
end;
$$;
`;

const PGCryptoEmPublic = PGCryptoEmExtensions
  .replace("create schema if not exists extensions;", "")
  .replaceAll("extensions.gen_salt", "public.gen_salt")
  .replaceAll("extensions.crypt", "public.crypt");

const db = new pglite.PGlite();

let falhas = 0;
const conferir = (titulo, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FALHA"} ${titulo}${extra ? ` — ${extra}` : ""}`);
  if (!ok) falhas += 1;
};

const comoUsuario = async (uid) => {
  if (uid) await db.exec(`select set_config('test.uid', '${uid}', false)`);
  else await db.exec(`select set_config('test.uid', '', false)`);
};

const tentar = async (sql, params = []) => {
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, erro: `${e.code ?? ""} ${e.message}`.trim() };
  }
};

await db.exec(SHIM);
await db.exec(PGCryptoEmExtensions);
console.log("· schema de apoio (auth, extensions, profiles, user_roles, workspaces): publicado");

await db.exec(migracao);
console.log("· migração das contas administrativas: publicada\n");

/* ---- contas de teste ---- */
const ADMIN = "11111111-1111-1111-1111-111111111111";
const MEMBRO = "22222222-2222-2222-2222-222222222222";

await db.exec(`
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '${ADMIN}', 'authenticated', 'authenticated', 'admin@empresa.com',
   extensions.crypt('SenhaAdmin1', extensions.gen_salt('bf')), now(), '{"provider":"email"}', '{}'),
  ('00000000-0000-0000-0000-000000000000', '${MEMBRO}', 'authenticated', 'authenticated', 'membro@empresa.com',
   extensions.crypt('SenhaMembro1', extensions.gen_salt('bf')), now(), '{"provider":"email"}', '{}');

insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin'), ('${MEMBRO}', 'member');
`);

const criar = `select public.admin_create_user($1, $2, $3, $4::public.app_role, $5::jsonb, $6::jsonb) as r`;

/* ---- 1. quem pode chamar ---- */
await comoUsuario(null);
let r = await tentar(criar, ["novo@empresa.com", "SenhaNova1", "Novo Usuário", "member", "[]", "{}"]);
conferir(
  "sem sessão a criação é recusada",
  !r.ok && /sess[aã]o expirou/i.test(r.erro),
  r.ok ? "criou!" : r.erro,
);

await comoUsuario(MEMBRO);
r = await tentar(criar, ["novo@empresa.com", "SenhaNova1", "Novo Usuário", "member", "[]", "{}"]);
conferir(
  "quem não é admin não cria conta",
  !r.ok && /restrito a administradores/i.test(r.erro),
  r.ok ? "criou!" : r.erro,
);
conferir(
  "nada foi gravado nas tentativas recusadas",
  (await db.query("select count(*)::int as n from auth.users where email = $1", ["novo@empresa.com"])).rows[0].n === 0,
);

/* ---- 2. validações ---- */
await comoUsuario(ADMIN);
r = await tentar(criar, ["sem-arroba", "SenhaNova1", "Fulano", "member", "[]", "{}"]);
conferir("e-mail inválido é recusado", !r.ok && /e-mail válido/i.test(r.erro), r.ok ? "criou!" : r.erro);

r = await tentar(criar, ["curta@empresa.com", "12345", "Fulano", "member", "[]", "{}"]);
conferir("senha curta é recusada", !r.ok && /pelo menos 6 caracteres/i.test(r.erro), r.ok ? "criou!" : r.erro);

/* ---- 3. criação feliz (member, com permissões) ---- */
const telas = JSON.stringify([{ screen: "schedules", actions: ["read", "write"] }, { screen: "notes", actions: ["read"] }]);
const agendaFixa = "33333333-3333-3333-3333-333333333333";
const agendamentos = JSON.stringify({ [agendaFixa]: "read" });

r = await tentar(criar, ["Novo.Usuario@Empresa.com ", "SenhaNova1", "  Novo Usuário  ", "member", telas, agendamentos]);
conferir("admin cria a conta", r.ok && r.rows[0].r?.success === true, r.ok ? JSON.stringify(r.rows[0].r) : r.erro);
const novoId = r.ok ? r.rows[0].r.user_id : null;
conferir("e-mail é normalizado (minúsculo, sem espaços)", r.ok && r.rows[0].r.email === "novo.usuario@empresa.com");

const conta = (
  await db.query(`select * from auth.users where id = $1`, [novoId])
).rows[0];
conferir("linha em auth.users", !!conta);
conferir("e-mail já confirmado (login não trava)", !!conta?.email_confirmed_at);
conferir("aud/role 'authenticated' e instance_id do Supabase", conta?.aud === "authenticated" && conta?.role === "authenticated" && conta?.instance_id === "00000000-0000-0000-0000-000000000000");
conferir("senha não fica em claro", !!conta?.encrypted_password && conta.encrypted_password !== "SenhaNova1");
conferir(
  "hash confere com crypt() — é o mesmo formato do GoTrue ($2a$10$)",
  /^\$2a\$10\$/.test(conta?.encrypted_password ?? "") &&
    (await db.query("select extensions.crypt($1, $2) = $2 as igual", ["SenhaNova1", conta.encrypted_password])).rows[0].igual === true,
);
conferir("nome guardado nos metadados", conta?.raw_user_meta_data?.full_name === "Novo Usuário");
conferir(
  "raw_app_meta_data com provider email",
  conta?.raw_app_meta_data?.providers?.includes("email") === true,
);

const identidade = (await db.query(`select * from auth.identities where user_id = $1`, [novoId])).rows[0];
conferir(
  "auth.identities criado (sem isso o login diz 'Invalid login credentials')",
  identidade?.provider === "email" && identidade?.provider_id === novoId && identidade?.identity_data?.email === "novo.usuario@empresa.com",
  JSON.stringify(identidade ?? {}).slice(0, 120),
);

const perfil = (await db.query(`select * from public.profiles where id = $1`, [novoId])).rows[0];
conferir(
  "perfil criado com nome/e-mail e base Implantação",
  perfil?.full_name === "Novo Usuário" &&
    perfil?.email === "novo.usuario@empresa.com" &&
    perfil?.active_workspace_id === (await db.query("select id from public.workspaces where slug = 'implantacao'")).rows[0].id,
);

const vinculos = (await db.query(`select count(*)::int as n from public.workspace_members where user_id = $1`, [novoId])).rows[0].n;
conferir("vínculo com as 2 bases", vinculos === 2, `vínculos: ${vinculos}`);

const papel = (
  await db.query(`select role, screen_permissions, schedule_permissions from public.user_roles where user_id = $1`, [novoId])
).rows[0];
conferir("papel 'member'", papel?.role === "member");
conferir("telas permitidas guardadas", JSON.stringify(papel?.screen_permissions) === telas.replace(/\s/g, ""), JSON.stringify(papel?.screen_permissions));
conferir("cronogramas permitidos guardados", papel?.schedule_permissions?.[agendaFixa] === "read");

/* ---- 4. e-mail repetido ---- */
r = await tentar(criar, ["novo.usuario@empresa.com", "OutraSenha1", "Outro", "member", "[]", "{}"]);
conferir(
  "e-mail repetido é recusado com instrução",
  !r.ok && /já existe uma conta/i.test(r.erro) && /Definir senha/i.test(r.erro),
  r.ok ? "criou!" : r.erro,
);
conferir(
  "conta original não foi tocada",
  (await db.query("select count(*)::int as n from auth.users where email = 'novo.usuario@empresa.com'")).rows[0].n === 1,
);

/* ---- 5. criar como admin não guarda permissões ---- */
r = await tentar(criar, ["chefe@empresa.com", "SenhaChefe1", "Chefe", "admin", telas, agendamentos]);
const chefeId = r.ok ? r.rows[0].r.user_id : null;
const papelChefe = (
  await db.query(`select role, screen_permissions, schedule_permissions from public.user_roles where user_id = $1`, [chefeId])
).rows[0];
conferir(
  "conta criada como admin nasce administradora e sem restrições",
  papelChefe?.role === "admin" &&
    JSON.stringify(papelChefe.screen_permissions) === "[]" &&
    JSON.stringify(papelChefe.schedule_permissions) === "{}",
  JSON.stringify(papelChefe ?? {}),
);

/* ---- 6. definir senha ---- */
const antes = (await db.query("select encrypted_password from auth.users where id = $1", [novoId])).rows[0].encrypted_password;
r = await tentar(`select public.admin_set_password($1, $2) as r`, [novoId, "SenhaTrocada9"]);
const depois = (await db.query("select encrypted_password from auth.users where id = $1", [novoId])).rows[0].encrypted_password;
conferir("admin troca a senha", r.ok && depois !== antes && /^\$2a\$10\$/.test(depois));
conferir(
  "a senha nova confere e a antiga não",
  (await db.query("select extensions.crypt($1, $2) = $2 as nova_ok, extensions.crypt($3, $2) = $2 as antiga_ok", ["SenhaTrocada9", depois, "SenhaNova1"])).rows[0].nova_ok === true &&
    (await db.query("select extensions.crypt($1, $2) = $2 as igual", ["SenhaNova1", depois])).rows[0].igual === false,
);

r = await tentar(`select public.admin_set_password($1, $2) as r`, ["99999999-9999-9999-9999-999999999999", "SenhaQualquer1"]);
conferir("trocar senha de conta inexistente avisa", !r.ok && /conta não encontrada/i.test(r.erro), r.ok ? "passou!" : r.erro);

r = await tentar(`select public.admin_set_password($1, $2) as r`, [novoId, "123"]);
conferir("senha curta na troca é recusada", !r.ok && /pelo menos 6 caracteres/i.test(r.erro));

/* ---- 7. admin sim/não ---- */
r = await tentar(`select public.admin_set_admin($1, true) as r`, [novoId]);
conferir(
  "tornar admin",
  r.ok && (await db.query("select count(*)::int as n from public.user_roles where user_id = $1 and role = 'admin'", [novoId])).rows[0].n === 1,
);
conferir(
  "as permissões de member continuam guardadas",
  (await db.query("select count(*)::int as n from public.user_roles where user_id = $1 and role = 'member'", [novoId])).rows[0].n === 1,
);

r = await tentar(`select public.admin_set_admin($1, false) as r`, [ADMIN]);
conferir(
  "ninguém remove o próprio acesso",
  !r.ok && /próprio acesso/i.test(r.erro),
  r.ok ? "removeu!" : r.erro,
);

r = await tentar(`select public.admin_set_admin($1, false) as r`, [novoId]);
conferir(
  "remover admin",
  r.ok && (await db.query("select count(*)::int as n from public.user_roles where user_id = $1 and role = 'admin'", [novoId])).rows[0].n === 0,
);

/* ---- 8. salvar permissões ---- */
const novasTelas = JSON.stringify([{ screen: "clients", actions: ["read"] }]);
r = await tentar(`select public.admin_set_permissions($1, $2::jsonb, $3::jsonb) as r`, [chefeId, novasTelas, "{}"]);
conferir(
  "permissões salvam sem apagar o papel admin",
  r.ok &&
    (await db.query("select count(*)::int as n from public.user_roles where user_id = $1 and role = 'admin'", [chefeId])).rows[0].n === 1 &&
    JSON.stringify((await db.query("select screen_permissions from public.user_roles where user_id = $1 and role = 'member'", [chefeId])).rows[0]?.screen_permissions) === novasTelas.replace(/\s/g, ""),
);

/* ---- 9. permissões de execução ---- */
const permitido = async (papel, assinatura) =>
  (await db.query(`select has_function_privilege($1, $2, 'execute') as p`, [papel, assinatura])).rows[0].p;
conferir(
  "anon não executa as funções administrativas",
  (await permitido("anon", "public.admin_create_user(text,text,text,public.app_role,jsonb,jsonb)")) === false &&
    (await permitido("anon", "public.admin_set_password(uuid,text)")) === false &&
    (await permitido("anon", "public.admin_set_admin(uuid,boolean)")) === false &&
    (await permitido("anon", "public.admin_set_permissions(uuid,jsonb,jsonb)")) === false &&
    (await permitido("anon", "public.admin_password_hash(text)")) === false,
);
conferir(
  "quem está logado pode chamar (a checagem de admin é feita dentro)",
  (await permitido("authenticated", "public.admin_create_user(text,text,text,public.app_role,jsonb,jsonb)")) === true &&
    (await permitido("authenticated", "public.admin_set_password(uuid,text)")) === true &&
    (await permitido("authenticated", "public.admin_set_admin(uuid,boolean)")) === true &&
    (await permitido("authenticated", "public.admin_set_permissions(uuid,jsonb,jsonb)")) === true,
);

/* ---- 10. idempotência ---- */
let reexecucao = { ok: true, erro: "" };
try {
  await db.exec(migracao);
} catch (e) {
  reexecucao = { ok: false, erro: e.message };
}
conferir("migração roda de novo sem erro", reexecucao.ok, reexecucao.ok ? "" : reexecucao.erro);
conferir(
  "e não duplica/estraga as contas",
  (await db.query("select count(*)::int as n from auth.users")).rows[0].n === 4,
  `contas: ${(await db.query("select count(*)::int as n from auth.users")).rows[0].n}`,
);

/* ---- 11. pgcrypto em public (banco fora do Supabase) ---- */
const db2 = new pglite.PGlite();
let fallbackOk = false;
let fallbackErro = "";
try {
  await db2.exec(SHIM);
  await db2.exec(PGCryptoEmPublic);
  await db2.exec(migracao);
  const h = (await db2.query("select public.admin_password_hash('QualquerSenha1') as h")).rows[0].h;
  fallbackOk = /^\$2a\$10\$/.test(h) && (await db2.query("select public.crypt('QualquerSenha1', $1) = $1 as ok", [h])).rows[0].ok === true;
} catch (e) {
  fallbackErro = e.message;
}
conferir("funciona com o pgcrypto em public (sem schema extensions)", fallbackOk, fallbackErro);
await db2.close();

await db.close();

console.log(falhas === 0 ? "\ntodos os testes passaram" : `\n${falhas} teste(s) falharam`);
process.exit(falhas === 0 ? 0 : 1);
