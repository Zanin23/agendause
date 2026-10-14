#!/usr/bin/env node
/* ============================================================================
   Testes da migração 20261014150000_levantamento_modulos_e_perguntas_padrao.sql
   num PostgreSQL real (PGlite).

   O que é conferido:
     1. a carga inicial traz os 6 módulos e as 25 perguntas do padrão;
     2. os módulos opcionais são Produção, Estoque, Faturamento e PDV;
     3. rodar a migração de novo não duplica nada;
     4. usuário comum lê, mas não grava módulos nem perguntas padrão (RLS);
     5. administrador grava;
     6. process_surveys ganhou decided_modules (começa vazio).

   Como rodar:
     npm install --no-save @electric-sql/pglite
     node scripts/testes/levantamento-modulos-sql.mjs

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
      "e depois:\n  node scripts/testes/levantamento-modulos-sql.mjs",
  );
  process.exit(0);
}

const migracao = readFileSync(
  resolve(RAIZ, "supabase/migrations/20261014150000_levantamento_modulos_e_perguntas_padrao.sql"),
  "utf8",
);

/* ---- ambiente mínimo: o que o Supabase já tem antes desta migração ---- */
const SHIM = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

create type public.app_role as enum ('admin', 'member');
create table public.user_roles (
  user_id uuid not null,
  role public.app_role not null,
  primary key (user_id, role)
);
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.process_surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Levantamento de Processos'
);
grant select, insert, update, delete on public.process_surveys to authenticated;
`;

const db = new pglite.PGlite();

let falhas = 0;
const conferir = (titulo, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "  FALHA"} ${titulo}${extra ? ` — ${extra}` : ""}`);
  if (!ok) falhas += 1;
};

const comoUsuario = async (uid) => {
  await db.exec(`select set_config('test.uid', '${uid ?? ""}', false)`);
};

const tentar = async (sql, params = []) => {
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, erro: `${e.code ?? ""} ${e.message}`.trim() };
  }
};

const ADMIN = "11111111-1111-1111-1111-111111111111";
const MEMBRO = "22222222-2222-2222-2222-222222222222";

await db.exec(SHIM);
await db.exec(`insert into public.user_roles values ('${ADMIN}', 'admin'), ('${MEMBRO}', 'member')`);
await db.exec(migracao);
console.log("· migração publicada\n");

/* ---- 1 e 2. carga inicial ---- */
const modulos = (await db.query("select code, section, optional from public.survey_modules order by position")).rows;
conferir("6 módulos carregados", modulos.length === 6, `módulos: ${modulos.length}`);
conferir(
  "opcionais: Produção, Estoque, Faturamento e PDV; Comercial e Financeiro sempre",
  JSON.stringify(modulos.filter((m) => m.optional).map((m) => m.code)) ===
    JSON.stringify(["producao", "estoque", "faturamento", "pdv"]) &&
    modulos.filter((m) => !m.optional).map((m) => m.code).join() === "comercial,financeiro",
);

const perguntas = (await db.query("select module_code, count(*)::int as n from public.survey_template_questions group by module_code")).rows;
const porModulo = Object.fromEntries(perguntas.map((r) => [r.module_code, r.n]));
const total = perguntas.reduce((s, r) => s + r.n, 0);
conferir("25 perguntas padrão carregadas", total === 25, `total: ${total}`);
conferir(
  "perguntas por módulo batem com o padrão do código (6/5/5/3/3/3)",
  porModulo.comercial === 6 && porModulo.financeiro === 5 && porModulo.estoque === 5 &&
    porModulo.producao === 3 && porModulo.faturamento === 3 && porModulo.pdv === 3,
  JSON.stringify(porModulo),
);

const pcp = (await db.query("select terms from public.survey_modules where code = 'producao'")).rows[0];
conferir("Produção vem com o termo PCP", pcp?.terms?.includes("PCP"), JSON.stringify(pcp?.terms));

const tipos = (await db.query("select count(*)::int as n from public.survey_template_questions where options::text is not null and jsonb_typeof(options) = 'array'")).rows[0].n;
conferir("opções das perguntas são arrays JSON", tipos === 25);

/* ---- 6. coluna nova no levantamento ---- */
const coluna = (await db.query(
  "select data_type from information_schema.columns where table_schema = 'public' and table_name = 'process_surveys' and column_name = 'decided_modules'",
)).rows[0];
conferir("process_surveys ganhou decided_modules", coluna?.data_type === "ARRAY");
await db.exec("insert into public.process_surveys (title) values ('teste')");
const decididos = (await db.query("select decided_modules from public.process_surveys limit 1")).rows[0];
conferir("decided_modules começa vazio", Array.isArray(decididos?.decided_modules) && decididos.decided_modules.length === 0);

/* ---- 3. rodar de novo ---- */
let reexecucao = { ok: true, erro: "" };
try {
  await db.exec(migracao);
} catch (e) {
  reexecucao = { ok: false, erro: e.message };
}
conferir("migração roda de novo sem erro", reexecucao.ok, reexecucao.erro);
const depois = (await db.query("select (select count(*) from public.survey_modules)::int as m, (select count(*) from public.survey_template_questions)::int as q")).rows[0];
conferir("e não duplica módulos nem perguntas", depois.m === 6 && depois.q === 25, JSON.stringify(depois));

/* ---- 4. usuário comum: lê sim, grava não ---- */
await comoUsuario(MEMBRO);
await db.exec("set role authenticated");
let r = await tentar("select count(*)::int as n from public.survey_template_questions");
conferir("usuário comum lê as perguntas padrão", r.ok && r.rows[0].n === 25, r.ok ? "" : r.erro);

r = await tentar("insert into public.survey_template_questions (module_code, position, label) values ('pdv', 99, 'Pergunta indevida')");
conferir("usuário comum não cria pergunta padrão", !r.ok, r.ok ? "criou!" : "");
r = await tentar("update public.survey_modules set terms = '{}' where code = 'producao'");
const termosAposTentativa = (await db.query("select terms from public.survey_modules where code = 'producao'")).rows[0];
conferir("usuário comum não altera os termos (nada muda)", termosAposTentativa.terms.includes("PCP"));
r = await tentar("delete from public.survey_modules where code = 'pdv'");
const aindaExiste = (await db.query("select count(*)::int as n from public.survey_modules where code = 'pdv'")).rows[0].n === 1;
conferir("usuário comum não apaga módulo", aindaExiste);

/* o levantamento continua editável por quem já podia (decided_modules) */
r = await tentar("update public.process_surveys set decided_modules = array['producao']");
conferir("usuário comum registra a decisão no levantamento", r.ok, r.ok ? "" : r.erro);
await db.exec("reset role");

/* ---- 5. administrador: grava ---- */
await comoUsuario(ADMIN);
await db.exec("set role authenticated");
r = await tentar("insert into public.survey_template_questions (module_code, position, label) values ('pdv', 4, 'Quantas impressoras fiscais?')");
conferir("administrador cria pergunta padrão", r.ok, r.ok ? "" : r.erro);
r = await tentar("update public.survey_modules set terms = array['PCP','MRP'] where code = 'producao'");
conferir("administrador altera os termos de um módulo", r.ok, r.ok ? "" : r.erro);
const termos = (await db.query("select terms from public.survey_modules where code = 'producao'")).rows[0];
conferir("termos novos valem", JSON.stringify(termos.terms) === '["PCP","MRP"]', JSON.stringify(termos.terms));
await db.exec("reset role");

await db.close();
console.log(falhas === 0 ? "\ntodos os testes passaram" : `\n${falhas} teste(s) falharam`);
process.exit(falhas === 0 ? 0 : 1);
