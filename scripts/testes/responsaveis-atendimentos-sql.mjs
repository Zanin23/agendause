#!/usr/bin/env node
/* ============================================================================
   Testes da migração 20261127120000_responsaveis_atendimentos.sql num
   PostgreSQL real (PGlite = Postgres em WebAssembly), com as duas migrações
   anteriores de responsáveis aplicadas antes (o estado de produção hoje).

   O que é conferido:
     1. a migração roda e é idempotente (rodar de novo não quebra nada);
     2. só administrador cadastra/renomeia/arquiva/restaura;
     3. vínculo com usuário da base, nome livre, renomear, arquivar/restaurar;
     4. lista de atribuição = lista padrão + cadastro (com flag `archived`);
     5. criar/substituir treinamento com responsáveis mistos
        (padrão + cadastro vinculado + nome livre) e com responsáveis
        só de nome livre (responsible_user_id legado fica NULL);
     6. não aceita atribuir pessoa arquivada, id inventado ou não-membro;
     7. duplicidade de nome é recusada.

   Como rodar (o PGlite não é dependência do projeto — é só para teste):

     npm install --no-save @electric-sql/pglite
     node scripts/testes/responsaveis-atendimentos-sql.mjs
   ============================================================================ */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRACOES = [
  "supabase/migrations/20261116175034_responsavel_treinamento.sql",
  "supabase/migrations/20261116184611_multiple_training_responsibles.sql",
  "supabase/migrations/20261127120000_responsaveis_atendimentos.sql",
];

const pglite = await import("@electric-sql/pglite").catch(() => null);
if (!pglite) {
  console.log(
    "PGlite não encontrado. Rode antes:\n  npm install --no-save @electric-sql/pglite\n" +
      "e depois:\n  node scripts/testes/responsaveis-atendimentos-sql.mjs",
  );
  process.exit(0);
}

const IMPL = "11111111-1111-1111-1111-111111111111";
const SUPORTE = "22222222-2222-2222-2222-222222222222";
const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";       // Matheus Zanin (lista padrão)
const CLAUDINEI = "cccccccc-cccc-cccc-cccc-cccccccccccc";    // Claudinei (lista padrão)
const ANA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";          // Ana Souza (fora da padrão)
const EXTERNO = "dddddddd-dddd-dddd-dddd-dddddddddddd";      // só existe, não é membro da Implantação? é membro da Suporte

const SHIM = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create type public.app_role as enum ('admin', 'member');

create table public.user_roles (
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key,
  full_name text,
  email text,
  active_workspace_id uuid references public.workspaces(id),
  created_at timestamptz not null default now()
);

create or replace function public.current_workspace()
returns uuid language sql stable security definer set search_path = public as $$
  select active_workspace_id from public.profiles where id = auth.uid()
$$;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.is_workspace_member(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where user_id = auth.uid() and workspace_id = _workspace_id)
$$;

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client text,
  description text,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 60,
  location text,
  internal_notes text,
  visit_type text,
  requires_acceptance boolean not null default true,
  created_by uuid,
  workspace_id uuid references public.workspaces(id),
  responsible_user_id uuid,
  created_at timestamptz not null default now()
);

create or replace function public.set_workspace_id_from_training()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.workspace_id is null then
    select workspace_id into NEW.workspace_id from public.trainings where id = NEW.training_id;
  end if;
  return NEW;
end;
$$;

insert into public.workspaces (id, slug, name) values
  ('${IMPL}', 'implantacao', 'Implantação'),
  ('${SUPORTE}', 'suporte', 'Suporte');

insert into public.profiles (id, full_name, email, active_workspace_id) values
  ('${ADMIN}', 'Matheus Zanin', 'admin@use.com.br', '${IMPL}'),
  ('${CLAUDINEI}', 'Claudinei', 'claudinei@use.com.br', '${IMPL}'),
  ('${ANA}', 'Ana Souza', 'ana@use.com.br', '${IMPL}'),
  ('${EXTERNO}', 'Beto Externo', 'beto@suporte.com', '${SUPORTE}');

insert into auth.users (id, email) values
  ('${ADMIN}', 'admin@use.com.br'),
  ('${CLAUDINEI}', 'claudinei@use.com.br'),
  ('${ANA}', 'ana@use.com.br'),
  ('${EXTERNO}', 'beto@suporte.com');

insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin');

insert into public.workspace_members (workspace_id, user_id) values
  ('${IMPL}', '${ADMIN}'),
  ('${IMPL}', '${CLAUDINEI}'),
  ('${IMPL}', '${ANA}'),
  ('${SUPORTE}', '${EXTERNO}'),
  ('${SUPORTE}', '${ADMIN}');
`;

const db = new pglite.PGlite();
let falhas = 0;
const conferir = (titulo, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FALHA"} ${titulo}${extra ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};
const logarComo = async (uid) => {
  await db.query("select set_config('test.uid', $1, false)", [uid]);
};
const esperaErro = async (titulo, fn, trecho) => {
  try {
    await fn();
    conferir(titulo, false, "a operação foi aceita");
  } catch (e) {
    const msg = String(e?.message ?? e);
    conferir(titulo, msg.toLowerCase().includes(trecho.toLowerCase()), msg.split("\n")[0]);
  }
};

await db.exec(SHIM);
for (const arquivo of MIGRACOES) {
  try {
    await db.exec(readFileSync(resolve(RAIZ, arquivo), "utf8"));
  } catch (e) {
    console.error(`FALHA ao aplicar ${arquivo}`);
    console.error("mensagem:", e?.message?.split("\n")[0]);
    console.error("código:", e?.code, "posição:", e?.position ?? "-");
    process.exit(1);
  }
}
console.log("· shim + 3 migrações: publicados\n");

/* ---------- 1. lista de atribuição começa só com a padrão ---------- */
await logarComo(ANA);
let { rows } = await db.query("select full_name, archived from public.list_workspace_training_responsibles() order by archived, full_name");
conferir("lista padrão na base (Matheus + Claudinei)", rows.length === 2 && rows.every((r) => r.archived === false), JSON.stringify(rows));

/* ---------- 2. permissão de cadastro ---------- */
await logarComo(ANA);
await esperaErro("membro não cadastra", () => db.query("select public.create_workspace_responsible('Pessoa Teste', null)"), "administradores");
await esperaErro("membro não renomeia", () => db.query("select public.rename_workspace_responsible(gen_random_uuid(), 'Nome')"), "administradores");
await esperaErro("membro não lista o cadastro", () => db.query("select * from public.list_workspace_responsibles()"), "administradores");

/* ---------- 3. cadastro como admin ---------- */
await logarComo(ADMIN);
rows = (await db.query("select * from public.list_workspace_responsible_candidates()")).rows;
conferir("candidatos: só a Ana (padrão e já vistos ficam fora)", rows.length === 1 && rows[0].user_id === ANA, JSON.stringify(rows));

await esperaErro(
  "não vincula pessoa da lista padrão de novo",
  () => db.query("select public.create_workspace_responsible(null, $1)", [CLAUDINEI]),
  "lista padrão",
);

({ rows } = await db.query("select public.create_workspace_responsible(null, $1) as id", [ANA]));
const CADASTRO_ANA = rows[0].id;
conferir("vincula usuária da base", !!CADASTRO_ANA);

({ rows } = await db.query("select public.create_workspace_responsible('  Maria   da Recepção ', null) as id"));
const CADASTRO_MARIA = rows[0].id;
({ rows } = await db.query("select display_name from public.workspace_responsibles where id = $1", [CADASTRO_MARIA]));
conferir("nome livre com espaços normalizado", rows[0]?.display_name === "Maria da Recepção", rows[0]?.display_name);

await esperaErro("nome duplicado recusado", () => db.query("select public.create_workspace_responsible('maria da recepção', null)"), "nome");
await esperaErro("nome curto recusado", () => db.query("select public.create_workspace_responsible('M', null)"), "pelo menos 2");

({ rows } = await db.query("select * from public.list_workspace_responsibles() order by archived, display_name"));
conferir("cadastro lista Ana e Maria", rows.length === 2 && rows.every((r) => r.archived === false), JSON.stringify(rows));

/* ---------- 4. lista de atribuição atualizada ---------- */
await logarComo(ANA);
({ rows } = await db.query("select user_id, full_name, archived from public.list_workspace_training_responsibles()"));
conferir(
  "lista de atribuição inclui padrão + cadastro",
  rows.length === 4 && rows.filter((r) => !r.archived).length === 4,
  rows.map((r) => r.full_name).join(", "),
);

/* ---------- 5. criar treinamento com responsáveis mistos ---------- */
await logarComo(ANA);
const SCHEDULED = "2026-12-01T13:00:00.000Z";
({ rows } = await db.query(
  `select public.create_training_with_responsibles(
     'Visita mista', 'Cliente X', null, $1::timestamptz, 60, null, null, 'presencial', true,
     array[$2::uuid, $3::uuid, $4::uuid]) as id`,
  [SCHEDULED, CLAUDINEI, CADASTRO_ANA, CADASTRO_MARIA],
));
const TRAINING_1 = rows[0].id;
({ rows } = await db.query("select responsible_user_id from public.trainings where id = $1", [TRAINING_1]));
conferir("responsável legado = primeiro id de usuário (Claudinei)", rows[0]?.responsible_user_id === CLAUDINEI);
({ rows } = await db.query(
  "select responsible_user_id, workspace_responsible_id from public.training_responsibles where training_id = $1",
  [TRAINING_1],
));
conferir(
  "atribuições: 1 usuário + 2 cadastros",
  rows.length === 3
    && rows.some((r) => r.responsible_user_id === CLAUDINEI)
    && rows.some((r) => r.workspace_responsible_id === CADASTRO_ANA)
    && rows.some((r) => r.workspace_responsible_id === CADASTRO_MARIA),
  JSON.stringify(rows),
);

/* ---------- 6. treinamento só com nome livre ---------- */
({ rows } = await db.query(
  `select public.create_training_with_responsibles(
     'Visita de fora', null, null, $1::timestamptz, 90, null, null, 'remoto', false,
     array[$2::uuid]) as id`,
  [SCHEDULED, CADASTRO_MARIA],
));
const TRAINING_2 = rows[0].id;
({ rows } = await db.query("select responsible_user_id from public.trainings where id = $1", [TRAINING_2]));
conferir("sem usuário: responsible_user_id legado fica NULL", rows[0]?.responsible_user_id === null);

/* ---------- 7. recusas esperadas ---------- */
await esperaErro(
  "id inventado recusado",
  () => db.query("select public.create_training_with_responsibles('X', null, null, $1::timestamptz, 60, null, null, 'presencial', true, array[gen_random_uuid()])", [SCHEDULED]),
  "cadastradas e ativas",
);
await esperaErro(
  "usuário de outra base recusado",
  () => db.query("select public.create_training_with_responsibles('X', null, null, $1::timestamptz, 60, null, null, 'presencial', true, array[$2::uuid])", [SCHEDULED, EXTERNO]),
  "base ativa",
);
await esperaErro(
  "sem responsável recusado",
  () => db.query("select public.create_training_with_responsibles('X', null, null, $1::timestamptz, 60, null, null, 'presencial', true, '{}')", [SCHEDULED]),
  "pelo menos uma",
);

/* ---------- 8. substituir responsáveis ---------- */
await logarComo(ADMIN);
await db.query("select public.set_training_responsibles($1, array[$2::uuid])", [TRAINING_1, CADASTRO_MARIA]);
({ rows } = await db.query("select responsible_user_id, workspace_responsible_id from public.training_responsibles where training_id = $1", [TRAINING_1]));
conferir(
  "substituição deixa só o nome livre",
  rows.length === 1 && rows[0].workspace_responsible_id === CADASTRO_MARIA && rows[0].responsible_user_id === null,
  JSON.stringify(rows),
);
({ rows } = await db.query("select responsible_user_id from public.trainings where id = $1", [TRAINING_1]));
conferir("coluna legada zerada sem usuário", rows[0]?.responsible_user_id === null);

/* ---------- 9. arquivar esconde de novas atribuições ---------- */
await logarComo(ADMIN);
await db.query("select public.set_workspace_responsible_archived($1, true)", [CADASTRO_MARIA]);
await logarComo(ANA);
({ rows } = await db.query("select full_name, archived from public.list_workspace_training_responsibles()"));
conferir("arquivado aparece com archived=true", rows.find((r) => r.full_name === "Maria da Recepção")?.archived === true, JSON.stringify(rows));
await esperaErro(
  "não atribui pessoa arquivada",
  () => db.query("select public.create_training_with_responsibles('X', null, null, $1::timestamptz, 60, null, null, 'presencial', true, array[$2::uuid])", [SCHEDULED, CADASTRO_MARIA]),
  "ativas",
);
await logarComo(ADMIN);
await db.query("select public.set_workspace_responsible_archived($1, false)", [CADASTRO_MARIA]);
await logarComo(ANA);
({ rows } = await db.query("select count(*)::int as n from (select public.create_training_with_responsibles('De novo', null, null, $1::timestamptz, 60, null, null, 'presencial', true, array[$2::uuid])) t", [SCHEDULED, CADASTRO_MARIA]));
conferir("restaurado volta a ser atribuível", rows[0]?.n === 1);

/* ---------- 10. renomear ---------- */
await logarComo(ADMIN);
await db.query("select public.rename_workspace_responsible($1, 'Maria da Recepção Sênior')", [CADASTRO_MARIA]);
({ rows } = await db.query("select display_name from public.workspace_responsibles where id = $1", [CADASTRO_MARIA]));
conferir("renomeia o rótulo", rows[0]?.display_name === "Maria da Recepção Sênior");
await esperaErro("renomear para nome existente recusa", () => db.query("select public.rename_workspace_responsible($1, 'ana souza')", [CADASTRO_MARIA]), "nome");
await esperaErro("renomear para vazio recusa", () => db.query("select public.rename_workspace_responsible($1, '  ')", [CADASTRO_MARIA]), "pelo menos 2");

/* ---------- 11. restaurar cadastro arquivado vinculado a usuário ---------- */
await esperaErro(
  "não recria cadastro já existente: orienta restaurar",
  () => db.query("select public.create_workspace_responsible(null, $1)", [ANA]),
  "cadastrada",
);

/* ---------- 12. migração idempotente ---------- */
const antes = (await db.query("select count(*)::int as n from public.workspace_responsibles")).rows[0].n;
const antesAssign = (await db.query("select count(*)::int as n from public.training_responsibles")).rows[0].n;
await db.exec(readFileSync(resolve(RAIZ, MIGRACOES[2]), "utf8"));
const depois = (await db.query("select count(*)::int as n from public.workspace_responsibles")).rows[0].n;
const depoisAssign = (await db.query("select count(*)::int as n from public.training_responsibles")).rows[0].n;
conferir("rodar a migração de novo preserva o cadastro", antes === depois, `${antes} → ${depois}`);
conferir("rodar a migração de novo preserva as atribuições", antesAssign === depoisAssign, `${antesAssign} → ${depoisAssign}`);
await logarComo(ANA);
({ rows } = await db.query("select count(*)::int as n from public.list_workspace_training_responsibles()"));
conferir("funções continuam funcionando após reexecução", rows[0]?.n === 4, `${rows[0]?.n} responsáveis`);

console.log(falhas === 0 ? "\n✔ Todos os testes passaram." : `\n✖ ${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
