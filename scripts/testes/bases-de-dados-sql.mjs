#!/usr/bin/env node
/* ============================================================================
   Testes da migração 20261019120000_controle_de_bases.sql num PostgreSQL real
   (PGlite = Postgres em WebAssembly), com o mínimo de schema em volta.

   O que é conferido:
     1. bases que já existiam ficam protegidas e NÃO podem ser excluídas;
     2. só administrador cria/renomeia/exclui/listagem;
     3. criar base nova gera slug único, nasce vazia e dá acesso a todos;
     4. renomear muda SOMENTE o nome (slug e dados intactos);
     5. excluir exige nome exato, base vazia e sem usuário com ela ativa;
     6. nenhuma exclusão apaga dados de outra base;
     7. rodar a migração de novo não muda nada.

   Como rodar (o PGlite não é dependência do projeto — é só para teste):

     npm install --no-save @electric-sql/pglite
     node scripts/testes/bases-de-dados-sql.mjs
   ============================================================================ */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRACAO = "supabase/migrations/20261019120000_controle_de_bases.sql";

const pglite = await import("@electric-sql/pglite").catch(() => null);
if (!pglite) {
  console.log(
    "PGlite não encontrado. Rode antes:\n  npm install --no-save @electric-sql/pglite\n" +
      "e depois:\n  node scripts/testes/bases-de-dados-sql.mjs",
  );
  process.exit(0);
}

const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MEMBRO = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const IMPLANTACAO = "11111111-1111-1111-1111-111111111111";
const WALDEMAR = "22222222-2222-2222-2222-222222222222";

/* Schema mínimo: só o que a migração e o app tocam. No Supabase o resto
   (auth.uid, RLS etc.) já existe. As tabelas de dados existem para provar
   que a exclusão nunca derruba registros. */
const SHIM = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
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
  email text,
  active_workspace_id uuid references public.workspaces(id)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Tabelas de dados reais (com workspace_id) para provar que nada é apagado.
create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  title text,
  workspace_id uuid not null references public.workspaces(id)
);

create table public.commercial_assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade
);

create table public.handoff_terms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete set null
);

-- Bases que já existiam antes do recurso.
insert into public.workspaces (id, slug, name) values
  ('${IMPLANTACAO}', 'implantacao', 'Implantação'),
  ('${WALDEMAR}', 'waldemar', 'Waldemar');

insert into public.profiles (id, email, active_workspace_id) values
  ('${ADMIN}', 'admin@use.com.br', '${IMPLANTACAO}'),
  ('${MEMBRO}', 'membro@use.com.br', '${IMPLANTACAO}');

insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin');

insert into public.workspace_members (workspace_id, user_id) values
  ('${IMPLANTACAO}', '${ADMIN}'),
  ('${IMPLANTACAO}', '${MEMBRO}'),
  ('${WALDEMAR}', '${ADMIN}'),
  ('${WALDEMAR}', '${MEMBRO}');

-- Um treinamento já existente na base Implantação (não pode sumir nunca).
insert into public.trainings (id, title, workspace_id)
values ('99999999-9999-9999-9999-999999999999', 'Treinamento antigo', '${IMPLANTACAO}');
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

const existeBase = async (slug) => {
  const { rows } = await db.query("select 1 from public.workspaces where slug = $1", [slug]);
  return rows.length > 0;
};

await db.exec(SHIM);
const migracao = readFileSync(resolve(RAIZ, MIGRACAO), "utf8");
await db.exec(migracao);
console.log("· schema de apoio + migração: publicados\n");

/* ---------- 1. bases antigas protegidas ---------- */
await logarComo(ADMIN);
let { rows } = await db.query("select slug, is_protected from public.workspaces order by slug");
conferir(
  "bases que já existiam ficam protegidas",
  rows.every((r) => r.is_protected === true),
  rows.map((r) => `${r.slug}=${r.is_protected}`).join(", "),
);

await esperaErro(
  "não deixa excluir base antiga (Implantação)",
  () => db.query("select public.admin_delete_workspace($1, $2)", [IMPLANTACAO, "Implantação"]),
  "protegida",
);
conferir("Implantação continua no banco", await existeBase("implantacao"));

/* ---------- 2. permissão ---------- */
await logarComo(MEMBRO);
await esperaErro(
  "membro comum não cria base",
  () => db.query("select public.admin_create_workspace('Base do membro')"),
  "restrito a administradores",
);
await esperaErro(
  "membro comum não lista bases para gestão",
  () => db.query("select * from public.admin_list_workspaces()"),
  "restrito a administradores",
);
await esperaErro(
  "membro comum não renomeia base",
  () => db.query("select public.admin_rename_workspace($1, 'Invadida')", [IMPLANTACAO]),
  "restrito a administradores",
);
await esperaErro(
  "membro comum não exclui base",
  () => db.query("select public.admin_delete_workspace($1, 'Waldemar')", [WALDEMAR]),
  "restrito a administradores",
);
await logarComo(ADMIN);

/* ---------- 3. criar base ---------- */
rows = (await db.query("select * from public.admin_create_workspace('Filial Campinas')")).rows;
const campinas = rows[0];
conferir("cria base nova", !!campinas, JSON.stringify(campinas));
conferir("slug gerado", campinas?.slug === "filial-campinas", campinas?.slug);
conferir("base nova nasce desprotegida", campinas?.is_protected === undefined, "sem flag no retorno (default false)");
({ rows } = await db.query("select is_protected from public.workspaces where id = $1", [campinas.id]));
conferir("is_protected = false na base nova", rows[0]?.is_protected === false, String(rows[0]?.is_protected));

({ rows } = await db.query("select count(*)::int as n from public.workspace_members where workspace_id = $1", [campinas.id]));
conferir("todos os usuários recebem acesso à base nova", rows[0].n === 2, `${rows[0].n} vínculo(s)`);

rows = (await db.query("select * from public.admin_create_workspace('Filial Campinas')")).rows;
conferir("nome repetido ganha slug único", rows[0]?.slug === "filial-campinas-2", rows[0]?.slug);

rows = (await db.query("select * from public.admin_create_workspace('São José — Unidade 2')")).rows;
conferir("slug remove acentos e símbolos", rows[0]?.slug === "sao-jose-unidade-2", rows[0]?.slug);
const saoJose = rows[0];

await esperaErro("recusa nome vazio", () => db.query("select public.admin_create_workspace('  ')"), "2 caracteres");
await esperaErro("recusa nome gigante", () => db.query("select public.admin_create_workspace(repeat('a', 61))"), "60 caracteres");

/* ---------- 4. renomear ---------- */
await db.query("insert into public.trainings (title, workspace_id) values ('Aula 1', $1)", [campinas.id]);

rows = (await db.query("select * from public.admin_rename_workspace($1, 'Campinas Centro')", [campinas.id])).rows;
conferir("renomeia a base", rows[0]?.name === "Campinas Centro", rows[0]?.name);
conferir("slug não muda ao renomear", rows[0]?.slug === "filial-campinas", rows[0]?.slug);
({ rows } = await db.query("select title from public.trainings where workspace_id = $1", [campinas.id]));
conferir("renomear não toca nos registros", rows.length === 1 && rows[0].title === "Aula 1");

rows = (await db.query("select * from public.admin_rename_workspace($1, 'Implantação e Obras')", [IMPLANTACAO])).rows;
conferir("renomeia base antiga só no nome", rows[0]?.name === "Implantação e Obras" && rows[0]?.slug === "implantacao", JSON.stringify(rows[0]));
({ rows } = await db.query("select title from public.trainings where id = '99999999-9999-9999-9999-999999999999'"));
conferir("dados da base antiga continuam intactos", rows[0]?.title === "Treinamento antigo");
await db.query("update public.workspaces set name = 'Implantação' where id = $1", [IMPLANTACAO]);

/* ---------- 5. uso da base ---------- */
rows = (await db.query("select public.admin_workspace_usage($1) as u", [campinas.id])).rows;
conferir("uso conta os registros da base", Number(rows[0].u.total) === 1, JSON.stringify(rows[0].u));
conferir("uso aponta a tabela", Number(rows[0].u.tables.trainings) === 1, JSON.stringify(rows[0].u.tables));

rows = (await db.query("select public.admin_workspace_usage($1) as u", [saoJose.id])).rows;
conferir("base nova está vazia", Number(rows[0].u.total) === 0, JSON.stringify(rows[0].u));

/* ---------- 6. excluir com travas ---------- */
await esperaErro(
  "exige confirmação com o nome exato",
  () => db.query("select public.admin_delete_workspace($1, 'campinas')", [campinas.id]),
  "nome exato",
);
await esperaErro(
  "não exclui base com registros",
  () => db.query("select public.admin_delete_workspace($1, 'Campinas Centro')", [campinas.id]),
  "registro",
);
({ rows } = await db.query("select count(*)::int as n from public.trainings where workspace_id = $1", [campinas.id]));
conferir("registros continuam lá depois da tentativa", rows[0].n === 1);

await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [saoJose.id, MEMBRO]);
await esperaErro(
  "não exclui base ativa de algum usuário",
  () => db.query("select public.admin_delete_workspace($1, 'São José — Unidade 2')", [saoJose.id]),
  "ativa",
);
await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [IMPLANTACAO, MEMBRO]);

await db.query("select public.admin_delete_workspace($1, 'São José — Unidade 2')", [saoJose.id]);
conferir("exclui base nova vazia", !(await existeBase("sao-jose-unidade-2")));
({ rows } = await db.query("select count(*)::int as n from public.workspace_members where workspace_id = $1", [saoJose.id]));
conferir("vínculos da base excluída saem junto", rows[0].n === 0);

/* ---------- 7. nada de outra base foi tocado ---------- */
({ rows } = await db.query("select count(*)::int as n from public.workspaces"));
conferir("bases antigas + Campinas continuam", rows[0].n === 4, `${rows[0].n} bases`);
({ rows } = await db.query("select count(*)::int as n from public.trainings"));
conferir("treinamentos preservados", rows[0].n === 2, `${rows[0].n} treinamento(s)`);
({ rows } = await db.query("select name from public.workspaces where id = $1", [WALDEMAR]));
conferir("Waldemar intacta", rows[0]?.name === "Waldemar");

/* ---------- 8. relatório de gestão ---------- */
rows = (await db.query("select * from public.admin_list_workspaces()")).rows;
conferir("lista traz todas as bases", rows.length === 4, rows.map((r) => r.slug).join(", "));
conferir(
  "lista marca a base antiga como protegida",
  rows.find((r) => r.slug === "implantacao")?.is_protected === true,
);

/* ---------- 9. migração idempotente ---------- */
await db.exec(migracao);
({ rows } = await db.query("select slug, is_protected from public.workspaces order by slug"));
conferir(
  "rodar a migração de novo não muda proteção nem dados",
  rows.every((r) => (r.slug === "implantacao" || r.slug === "waldemar") === (r.is_protected === true)),
  rows.map((r) => `${r.slug}=${r.is_protected}`).join(", "),
);
({ rows } = await db.query("select count(*)::int as n from public.trainings"));
conferir("dados continuam após reexecutar a migração", rows[0].n === 2, `${rows[0].n} treinamento(s)`);

console.log(falhas === 0 ? "\n✔ Todos os testes passaram." : `\n✖ ${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
