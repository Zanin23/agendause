#!/usr/bin/env node
/* ============================================================================
   Testes da migração 20261119120000_acesso_e_exclusao_itens_cronograma.sql num
   PostgreSQL real (PGlite = Postgres em WebAssembly).

   O problema que originou a migração: a etapa era removida da tela, mas
   continuava aparecendo na impressão. A exclusão era descartada pelo RLS — e o
   RLS não devolve erro, só "zero linhas". Como a política de DELETE estava
   amarrada a `implementation_schedules.owner_id`, quem não criou o cronograma
   (ou qualquer um, quando o dono é uma conta que já não existe) não apagava
   nada, sem aviso.

   O que é conferido aqui:
     1. sem a migração, um administrador que não é o dono não apaga a etapa
        (a exclusão devolve 0 linhas);
     2. depois da migração, administrador apaga item, fase e cronograma;
     3. usuário sem permissão continua sem apagar nada (o RLS não foi aberto);
     4. a função `schedule_items_delete` devolve quantas linhas saíram — é o que
        o app usa para saber que "não apagou" e avisar em vez de mentir;
     5. apagar a etapa tira ela da leitura (é a leitura que a impressão faz).

   Como rodar (o PGlite não é dependência do projeto — é só para teste):

     npm install --no-save @electric-sql/pglite
     node scripts/testes/exclusao-itens-cronograma-sql.mjs
   ============================================================================ */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const pglite = await import("@electric-sql/pglite").catch(() => null);
if (!pglite) {
  console.log(
    "PGlite não encontrado. Rode antes:\n  npm install --no-save @electric-sql/pglite\n" +
      "e depois:\n  node scripts/testes/exclusao-itens-cronograma-sql.mjs",
  );
  process.exit(0);
}

const ler = (p) => readFileSync(resolve(RAIZ, p), "utf8");
const migracao = ler("supabase/migrations/20261119120000_acesso_e_exclusao_itens_cronograma.sql");

/* Dono que existe em auth.users e administrador da base. */
const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
/* Conta antiga, que já não existe em `auth.users` — dona dos cronogramas velhos. */
const DONO_FANTASMA = "bbbbbbbb-0000-4000-8000-000000000002";
/* Usuário sem nenhuma permissão de cronograma. */
const SEM_PERMISSAO = "cccccccc-0000-4000-8000-000000000003";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
/* Mesmos papéis/permissões que o app usa (has_schedule_permission). */
const DONO_CRONOGRAMA = "22222222-2222-2222-2222-222222222222";
const ITEM_DO_DONO = "33333333-3333-3333-3333-333333333333";
const ITEM_SEM_PERMISSAO = "44444444-4444-4444-4444-444444444444";

const SHIM = `
create role anon;
create role authenticated;
create role service_role;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;

create type public.app_role as enum ('admin', 'member');
create type public.schedule_item_status as enum ('pending','in_progress','done','blocked','rescheduled','not_applicable');
create type public.schedule_modality as enum ('presencial','remoto','hibrido');
create type public.schedule_cadence as enum ('semanal','quinzenal','mensal','customizada');

create table public.workspaces (id uuid primary key, nome text);

create table public.profiles (
  id uuid primary key,
  active_workspace_id uuid references public.workspaces(id)
);

create table public.user_roles (
  user_id uuid not null,
  role public.app_role not null,
  screen_permissions jsonb default '[]'::jsonb,
  schedule_permissions jsonb default '{}'::jsonb
);

create table public.implementation_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  client_name text not null,
  start_date date not null,
  status text not null default 'draft',
  workspace_id uuid references public.workspaces(id)
);

create table public.schedule_phases (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.implementation_schedules(id) on delete cascade,
  workspace_id uuid,
  position int not null default 0,
  title text not null
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.schedule_phases(id) on delete cascade,
  workspace_id uuid,
  position int not null default 0,
  title text not null,
  planned_date date,
  status public.schedule_item_status not null default 'pending'
);

create or replace function public.current_workspace() returns uuid
language sql stable security definer set search_path = public as $$
  select active_workspace_id from public.profiles where id = auth.uid()
$$;

create or replace function public.has_screen_permission(_user_id uuid, _screen text, _action text default 'read')
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin') then
    return true;
  end if;
  return exists (
    select 1 from public.user_roles
     where user_id = _user_id and screen_permissions @> jsonb_build_array(jsonb_build_object('screen', _screen))
  );
end;
$$;

create or replace function public.has_schedule_permission(_user_id uuid, _schedule_id uuid, _action text default 'read')
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  _perm text;
begin
  if exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin') then
    return true;
  end if;
  select schedule_permissions->>(_schedule_id::text) into _perm
    from public.user_roles where user_id = _user_id;
  if _perm is null then
    return public.has_screen_permission(_user_id, 'schedules', _action);
  end if;
  if _action = 'read' then
    return _perm in ('read', 'write');
  elsif _action = 'write' then
    return _perm = 'write';
  end if;
  return false;
end;
$$;

-- Políticas de leitura/escrita como estão em produção hoje.
alter table public.implementation_schedules enable row level security;
alter table public.schedule_phases enable row level security;
alter table public.schedule_items enable row level security;

create policy "Authenticated read schedules" on public.implementation_schedules
  for select to authenticated using (auth.uid() is not null);
create policy "Authenticated update schedules" on public.implementation_schedules
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "ws_isolation" on public.implementation_schedules as restrictive for all to authenticated
  using (workspace_id = public.current_workspace()) with check (workspace_id = public.current_workspace());

create policy "Authenticated read phases" on public.schedule_phases
  for select to authenticated using (auth.uid() is not null);
create policy "Authenticated update phases" on public.schedule_phases
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Owner manages phases" on public.schedule_phases for all to authenticated
  using (exists (select 1 from public.implementation_schedules s where s.id = schedule_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.implementation_schedules s where s.id = schedule_id and s.owner_id = auth.uid()));
create policy "ws_isolation" on public.schedule_phases as restrictive for all to authenticated
  using (workspace_id = public.current_workspace()) with check (workspace_id = public.current_workspace());

create policy "Authenticated read items" on public.schedule_items
  for select to authenticated using (auth.uid() is not null);
create policy "Authenticated update items" on public.schedule_items
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "Owner manages items" on public.schedule_items for all to authenticated
  using (exists (
    select 1 from public.schedule_phases p join public.implementation_schedules s on s.id = p.schedule_id
     where p.id = phase_id and s.owner_id = auth.uid()))
  with check (exists (
    select 1 from public.schedule_phases p join public.implementation_schedules s on s.id = p.schedule_id
     where p.id = phase_id and s.owner_id = auth.uid()));
create policy "ws_isolation" on public.schedule_items as restrictive for all to authenticated
  using (workspace_id = public.current_workspace()) with check (workspace_id = public.current_workspace());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.implementation_schedules to authenticated;
grant select, insert, update, delete on public.schedule_phases to authenticated;
grant select, insert, update, delete on public.schedule_items to authenticated;
grant select on public.user_roles to authenticated;
`;

/* Dados: dois cronogramas — um do admin, outro de uma conta que não existe mais. */
const DADOS = `
insert into public.workspaces (id, nome) values ('${WORKSPACE}', 'Use Sistemas');
insert into public.profiles (id, active_workspace_id) values
  ('${ADMIN}', '${WORKSPACE}'),
  ('${SEM_PERMISSAO}', '${WORKSPACE}');
insert into public.user_roles (user_id, role) values ('${ADMIN}', 'admin');

insert into public.implementation_schedules (id, owner_id, client_name, start_date, status, workspace_id)
values
  ('${DONO_CRONOGRAMA}', '${ADMIN}', 'Cronograma do admin', current_date, 'active', '${WORKSPACE}'),
  ('55555555-5555-4555-8555-555555555555', '${DONO_FANTASMA}', 'Cronograma do dono antigo', current_date, 'active', '${WORKSPACE}');

insert into public.schedule_phases (id, schedule_id, workspace_id, position, title) values
  ('66666666-6666-4666-8666-666666666666', '${DONO_CRONOGRAMA}', '${WORKSPACE}', 0, 'Financeiro e Tesouraria'),
  ('77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555', '${WORKSPACE}', 0, 'Relatórios Gerenciais');

insert into public.schedule_items (id, phase_id, workspace_id, position, title, planned_date) values
  ('${ITEM_DO_DONO}', '66666666-6666-4666-8666-666666666666', '${WORKSPACE}', 0, 'Apuração de resultados', current_date),
  ('${ITEM_SEM_PERMISSAO}', '77777777-7777-4777-8777-777777777777', '${WORKSPACE}', 0, 'Tradição de Clientes e Fornecedores', current_date);
`;

const db = new pglite.PGlite();
let falhas = 0;
const conferir = (titulo, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FALHA"} ${titulo}${extra ? ` — ${extra}` : ""}`);
  if (!ok) falhas++;
};

/**
 * Roda o SQL como um usuário autenticado do app (RLS ligado de verdade).
 * Por padrão desfaz tudo no fim; com `persistir`, confirma a transação — assim
 * dá para conferir depois que a linha realmente saiu do banco (é o que a
 * impressão lê).
 */
async function como(usuario, sql, params = [], { persistir = false } = {}) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: usuario, role: "authenticated" }),
    ]);
    await db.exec("set local role authenticated");
    const res = await db.query(sql, params);
    await db.exec(persistir ? "commit" : "rollback");
    return res;
  } catch (erro) {
    await db.exec("rollback");
    throw erro;
  }
}

const existeItem = async (id) => {
  const { rows } = await db.query("select count(*)::int as n from public.schedule_items where id = $1", [id]);
  return rows[0].n > 0;
};

await db.exec(SHIM);
await db.exec(DADOS);
console.log("· schema de apoio + políticas de produção: publicados\n");

/* ---------- 1) o problema, antes da migração ---------- */
const antesAdmin = await como(
  ADMIN,
  "with d as (delete from public.schedule_items where id = $1 returning id) select count(*)::int as n from d",
  [ITEM_SEM_PERMISSAO],
);
conferir(
  "antes da migração: admin apagando etapa de cronograma de dono antigo → 0 linhas (falha silenciosa)",
  antesAdmin.rows[0].n === 0,
  `linhas: ${antesAdmin.rows[0].n}`,
);
conferir("…e a etapa continua no banco", await existeItem(ITEM_SEM_PERMISSAO));

const antesFase = await como(
  ADMIN,
  "with d as (delete from public.schedule_phases where id = $1 returning id) select count(*)::int as n from d",
  ["77777777-7777-4777-8777-777777777777"],
);
conferir("antes da migração: a fase também não saía", antesFase.rows[0].n === 0, `linhas: ${antesFase.rows[0].n}`);

/* ---------- 2) publica a migração ---------- */
await db.exec(migracao);
console.log("\n· migração de acesso/exclusão: publicada\n");

const comoAdmin = await como(
  ADMIN,
  "with d as (delete from public.schedule_items where id = $1 returning id) select count(*)::int as n from d",
  [ITEM_SEM_PERMISSAO],
  { persistir: true },
);
conferir("depois da migração: admin apaga a etapa do cronograma de dono antigo", comoAdmin.rows[0].n === 1, `linhas: ${comoAdmin.rows[0].n}`);
conferir("a etapa sai do banco (logo, sai da impressão)", !(await existeItem(ITEM_SEM_PERMISSAO)));

const faseApagada = await como(
  ADMIN,
  "with d as (delete from public.schedule_phases where id = $1 returning id) select count(*)::int as n from d",
  ["77777777-7777-4777-8777-777777777777"],
  { persistir: true },
);
conferir("admin apaga a fase inteira", faseApagada.rows[0].n === 1, `linhas: ${faseApagada.rows[0].n}`);

const cronogramaApagado = await como(
  ADMIN,
  "with d as (delete from public.implementation_schedules where id = $1 returning id) select count(*)::int as n from d",
  ["55555555-5555-4555-8555-555555555555"],
  { persistir: true },
);
conferir("admin apaga o cronograma", cronogramaApagado.rows[0].n === 1, `linhas: ${cronogramaApagado.rows[0].n}`);

/* ---------- 3) quem não tem permissão continua sem apagar ---------- */
const semPermissao = await como(
  SEM_PERMISSAO,
  "with d as (delete from public.schedule_items where id = $1 returning id) select count(*)::int as n from d",
  [ITEM_DO_DONO],
);
conferir("usuário sem permissão não apaga a etapa (RLS segue fechado)", semPermissao.rows[0].n === 0, `linhas: ${semPermissao.rows[0].n}`);
conferir("…e a etapa continua no banco", await existeItem(ITEM_DO_DONO));

const semPermissaoFase = await como(
  SEM_PERMISSAO,
  "with d as (delete from public.schedule_phases where id = $1 returning id) select count(*)::int as n from d",
  ["66666666-6666-4666-8666-666666666666"],
);
conferir("usuário sem permissão não apaga a fase", semPermissaoFase.rows[0].n === 0, `linhas: ${semPermissaoFase.rows[0].n}`);

/* ---------- 4) a função usada pelo app ---------- */
const rpcAdmin = await como(
  ADMIN,
  "select public.schedule_items_delete(array[$1]::uuid[]) as apagadas",
  [ITEM_DO_DONO],
  { persistir: true },
);
conferir("schedule_items_delete devolve quantas linhas saíram (admin)", rpcAdmin.rows[0].apagadas === 1, String(rpcAdmin.rows[0].apagadas));
conferir("a etapa apagada pela função não é mais lida (impressão não a mostra)", !(await existeItem(ITEM_DO_DONO)));

await db.exec(`
insert into public.schedule_items (id, phase_id, workspace_id, position, title, planned_date)
values ('88888888-8888-4888-8888-888888888888', '66666666-6666-4666-8666-666666666666', '${WORKSPACE}', 1, 'Conciliação de cheques', current_date)
`);

const rpcSemPermissao = await como(
  SEM_PERMISSAO,
  "select public.schedule_items_delete(array[$1]::uuid[]) as apagadas",
  ["88888888-8888-4888-8888-888888888888"],
);
conferir(
  "schedule_items_delete devolve 0 para quem não pode — é o aviso que o app mostra",
  rpcSemPermissao.rows[0].apagadas === 0,
  String(rpcSemPermissao.rows[0].apagadas),
);
conferir("…e nesse caso nada foi apagado", await existeItem("88888888-8888-4888-8888-888888888888"));

const rpcInexistente = await como(ADMIN, "select public.schedule_items_delete(array[gen_random_uuid()]::uuid[]) as apagadas");
conferir("apagar id inexistente devolve 0 (o app recarrega em vez de fingir sucesso)", rpcInexistente.rows[0].apagadas === 0, String(rpcInexistente.rows[0].apagadas));

/* ---------- 5) editar datas continua liberado para quem edita ---------- */
const dataZerada = await como(
  ADMIN,
  "with u as (update public.schedule_items set planned_date = null where id = $1 returning planned_date) select count(*)::int as n from u",
  ["88888888-8888-4888-8888-888888888888"],
  { persistir: true },
);
conferir("admin limpa a data prevista da etapa", dataZerada.rows[0].n === 1, `linhas: ${dataZerada.rows[0].n}`);

const { rows: semData } = await db.query(
  "select planned_date from public.schedule_items where id = '88888888-8888-4888-8888-888888888888'",
);
conferir("a data fica vazia no banco (não volta na impressão)", semData[0].planned_date === null, String(semData[0].planned_date));

const dataSemPermissao = await como(
  SEM_PERMISSAO,
  "with u as (update public.schedule_items set planned_date = current_date where id = $1 returning id) select count(*)::int as n from u",
  ["88888888-8888-4888-8888-888888888888"],
);
conferir("usuário sem permissão não mexe na data", dataSemPermissao.rows[0].n === 0, `linhas: ${dataSemPermissao.rows[0].n}`);

console.log(falhas === 0 ? "\n✔ Todos os testes passaram." : `\n✖ ${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
