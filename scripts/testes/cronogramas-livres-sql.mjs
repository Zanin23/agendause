#!/usr/bin/env node
/* ============================================================================
   Testes da migração 20261013120000_cronogramas_livres.sql num PostgreSQL real
   (PGlite = Postgres em WebAssembly), com o mínimo de schema em volta.

   O que é conferido:
     1. as colunas kind/title/subject existem e o check de `kind` recusa valor inválido;
     2. cronograma de implantação continua virando empresa no relatório;
     3. cronograma livre NÃO vira empresa (nem na tabela, nem na view);
     4. rodar a sincronização duas vezes não duplica nada;
     5. o id gerado no SQL é igual ao id do app.js do relatório (aqui estão
        alguns pares já conferidos contra o app.js de verdade);
     6. editar um cronograma livre não mexe no relatório.

   Como rodar (o PGlite não é dependência do projeto — é só para teste):

     npm install --no-save @electric-sql/pglite
     node scripts/testes/cronogramas-livres-sql.mjs

   Se o PGlite não estiver instalado, o script avisa e sai sem erro.
   ============================================================================ */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const pglite = await import("@electric-sql/pglite").catch(() => null);
if (!pglite) {
  console.log(
    "PGlite não encontrado. Rode antes:\n  npm install --no-save @electric-sql/pglite\n" +
      "e depois:\n  node scripts/testes/cronogramas-livres-sql.mjs",
  );
  process.exit(0);
}

const ler = (p) => readFileSync(resolve(RAIZ, p), "utf8");
const integracao = ler("supabase/migrations/20261012120000_integracao_relatorio_implantacoes.sql");
const livre = ler("supabase/migrations/20261013120000_cronogramas_livres.sql");

/* O schema de apoio: só as tabelas/colunas/funções que as migrações tocam
   (o Postgres do Supabase tem o resto: auth.uid, is_workspace_member…). */
const SHIM = `
create role anon;
create role authenticated;
create role service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$;

create type public.app_role as enum ('admin', 'member');
create type public.schedule_item_status as enum ('pending','in_progress','done','blocked','rescheduled','not_applicable');
create type public.schedule_modality as enum ('presencial','remoto','hibrido');
create type public.schedule_cadence as enum ('semanal','quinzenal','mensal','customizada');

create table public.workspaces (id uuid primary key, nome text);

create table public.implementation_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  client_name text not null,
  client_email text,
  start_date date not null,
  cadence public.schedule_cadence not null default 'semanal',
  modality public.schedule_modality not null default 'presencial',
  use_team text[] not null default array[]::text[],
  status text not null default 'draft',
  observations text,
  workspace_id uuid references public.workspaces(id),
  paused_at timestamptz,
  pause_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedule_phases (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.implementation_schedules(id) on delete cascade,
  workspace_id uuid,
  position int not null default 0,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.schedule_phases(id) on delete cascade,
  workspace_id uuid,
  position int not null default 0,
  title text not null,
  description text,
  planned_date date,
  done_date date,
  status public.schedule_item_status not null default 'pending',
  assignee text,
  notes text,
  training_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  title text,
  client text,
  workspace_id uuid,
  status text default 'agendado',
  scheduled_at timestamptz default now(),
  visit_type text default 'presencial'
);

create table public.documentos (
  id text primary key,
  dados jsonb not null default '{}'::jsonb,
  ordem int not null default 0,
  atualizado_em timestamptz not null default now()
);

create or replace function public.documentos_atualiza_data()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create trigger documentos_atualiza_data_gatilho
  before update on public.documentos
  for each row execute function public.documentos_atualiza_data();

create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean language sql stable as $$ select true $$;

create or replace function public.has_role(p_user uuid, p_role public.app_role)
returns boolean language sql stable as $$ select false $$;
`;

/* As partes da migração de integração que este teste precisa: tabela
   `documentos` (via shim), helpers e a versão ANTIGA da sincronização. */
function trechosDaIntegracao(sql) {
  const linhas = sql.split("\n");
  const inicio = (marca) => linhas.findIndex((l) => l.includes(marca));
  const a = inicio("-- 4) Helpers");
  const b = inicio("-- 6) Sincronização");
  const c = inicio("-- 7) A view");
  return { helpers: linhas.slice(a, b).join("\n"), sincronizacaoAntiga: linhas.slice(b, c).join("\n") };
}

/* Ids já conferidos contra o app.js do relatório (que é a fonte da verdade). */
const IDS_CONHECIDOS = {
  Griffe: "ngriffe-48jso",
  Raguso: "nraguso-6wi4wm",
  "Água Viva": "nagua-viva-whxsgp",
  "Casa & Cia": "ncasa-cia-109ngnk",
  "Móveis São João": "nmoveis-sao-joao-1gve0a4",
  "Ção Ltda ME": "ncao-ltda-me-vdb7ud",
};

const db = new pglite.PGlite();
let falhas = 0;
const conferir = (titulo, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FALHA"} ${titulo}${extra ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};

const { helpers, sincronizacaoAntiga } = trechosDaIntegracao(integracao);

await db.exec(SHIM);
await db.exec(helpers);
await db.exec(sincronizacaoAntiga);
console.log("· schema de apoio + helpers + sincronização original: publicados");

const antes = await db.query(
  `select count(*)::int as n from information_schema.columns
    where table_name = 'implementation_schedules' and column_name in ('kind','title','subject')`,
);
conferir("antes da migração não existe a coluna kind", antes.rows[0].n === 0, `colunas: ${antes.rows[0].n}`);

await db.exec(livre);
console.log("· migração dos cronogramas livres: publicada\n");

const colunas = await db.query(
  `select column_name from information_schema.columns
    where table_name = 'implementation_schedules' and column_name in ('kind','title','subject')
    order by column_name`,
);
conferir("colunas kind/title/subject criadas", colunas.rows.length === 3, colunas.rows.map((r) => r.column_name).join(", "));

let recusou = false;
try {
  await db.exec(
    `insert into public.implementation_schedules (client_name, start_date, kind) values ('X', current_date, 'xyz')`,
  );
} catch {
  recusou = true;
}
conferir("check recusa kind inválido", recusou);

await db.exec(`
insert into public.workspaces (id, nome) values ('11111111-1111-1111-1111-111111111111', 'Use Sistemas');

insert into public.implementation_schedules
  (id, client_name, start_date, workspace_id, status, use_team)
values ('22222222-2222-2222-2222-222222222222', 'Raguso', current_date - 10,
        '11111111-1111-1111-1111-111111111111', 'active', array['Matheus Zanin']);

insert into public.schedule_phases (id, schedule_id, position, title)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 0, 'Cadastros básicos');

insert into public.schedule_items (phase_id, position, title, planned_date, status, done_date)
values
  ('33333333-3333-3333-3333-333333333333', 0, 'Cadastro de usuários', current_date - 5, 'done', current_date - 4),
  ('33333333-3333-3333-3333-333333333333', 1, 'Cadastro de produtos', current_date - 2, 'pending', null);

-- cronograma livre: obra, sem cliente nenhum
insert into public.implementation_schedules
  (id, client_name, title, subject, kind, start_date, cadence, workspace_id)
values ('44444444-4444-4444-4444-444444444444', 'Obra — reforma da loja', 'Obra — reforma da loja', 'Obra', 'livre',
        current_date, 'customizada', '11111111-1111-1111-1111-111111111111');

insert into public.schedule_phases (id, schedule_id, position, title)
values ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 0, 'Diagnóstico');

insert into public.schedule_items (phase_id, position, title, status)
values ('55555555-5555-5555-5555-555555555555', 0, 'Medir o salão', 'pending');
`);

const primeira = await db.query(`select public.rel_sincronizar_agenda() as r`);
conferir("sincronização criou só a empresa da implantação", primeira.rows[0].r.criados === 1, JSON.stringify(primeira.rows[0].r));

const docs = await db.query(`select id, dados from public.documentos order by id`);
conferir("documentos tem exatamente 1 linha", docs.rows.length === 1, docs.rows.map((d) => d.id).join(", "));
conferir(
  'o id é o mesmo do app.js do relatório para "Raguso"',
  docs.rows[0]?.id === IDS_CONHECIDOS.Raguso,
  `esperado ${IDS_CONHECIDOS.Raguso} · gravado ${docs.rows[0]?.id}`,
);
conferir("o cronograma foi publicado com as 2 etapas", docs.rows[0]?.dados?.cronograma?.length === 2, `etapas: ${docs.rows[0]?.dados?.cronograma?.length}`);
conferir("nenhuma linha com o nome do cronograma livre", !docs.rows.some((d) => String(d.dados?.nome || "").includes("Obra")));

const view = await db.query(`select id, nome, origem, itens_total from public.vw_relatorio_implantacoes`);
conferir("a view mostra só a empresa de implantação", view.rows.length === 1, JSON.stringify(view.rows));
conferir("a view conta os itens do cronograma", Number(view.rows[0]?.itens_total) === 2, String(view.rows[0]?.itens_total));

const segunda = await db.query(`select public.rel_sincronizar_agenda() as r`);
conferir("rodar de novo não duplica", segunda.rows[0].r.criados === 0 && segunda.rows[0].r.atualizados === 1, JSON.stringify(segunda.rows[0].r));

for (const [nome, esperado] of Object.entries(IDS_CONHECIDOS)) {
  const { rows } = await db.query(`select public.rel_id_documento($1) as id`, [nome]);
  conferir(`id no SQL = id do app.js para "${nome}"`, rows[0].id === esperado, `${rows[0].id} × ${esperado}`);
}

const porBase = await db.query(`select public.rel_sincronizar_agenda('11111111-1111-1111-1111-111111111111'::uuid) as r`);
conferir("sincronizar por base continua funcionando", porBase.rows[0].r.atualizados === 1, JSON.stringify(porBase.rows[0].r));

await db.query(
  `update public.implementation_schedules set title = 'Obra — reforma (revisada)'
    where id = '44444444-4444-4444-4444-444444444444'`,
);
const livreEditado = await db.query(
  `select kind, title, subject from public.implementation_schedules where id = '44444444-4444-4444-4444-444444444444'`,
);
conferir("cronograma livre guarda título e assunto", livreEditado.rows[0]?.title === "Obra — reforma (revisada)" && livreEditado.rows[0]?.subject === "Obra");
const docsFinal = await db.query(`select count(*)::int as n from public.documentos`);
conferir("editar o cronograma livre não cria empresa no relatório", docsFinal.rows[0].n === 1, String(docsFinal.rows[0].n));

console.log(falhas === 0 ? "\n✔ Todos os testes passaram." : `\n✖ ${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
