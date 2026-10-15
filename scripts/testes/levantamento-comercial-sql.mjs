#!/usr/bin/env node
/*
 * Testa a migração de Levantamento Comercial no PostgreSQL embutido do PGlite.
 * O teste usa um workspace e um cliente fictícios e não acessa o Supabase real.
 * Requer @electric-sql/pglite instalado temporariamente no ambiente.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PGlite = await import("@electric-sql/pglite").catch(() => null);
if (!PGlite) {
  console.error("PGlite não encontrado. Rode npm install --no-save --package-lock=false @electric-sql/pglite");
  process.exit(1);
}
const migration = readFileSync(resolve(root, "supabase/migrations/20261015120000_levantamento_comercial.sql"), "utf8");

const shim = `
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid primary key, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('email', 'teste@example.invalid', 'user_metadata', jsonb_build_object('full_name', 'Usuário de Teste'))
$$;
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TABLE public.workspaces (id uuid primary key default gen_random_uuid(), name text not null);
CREATE TABLE public.profiles (id uuid primary key, full_name text, active_workspace_id uuid references public.workspaces(id));
CREATE TABLE public.user_roles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), role public.app_role not null,
  screen_permissions jsonb default '[]'::jsonb, schedule_permissions jsonb default '{}'::jsonb
);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.current_workspace()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT active_workspace_id FROM public.profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.implementation_schedules (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
  client_name text not null, kind text not null default 'implantacao'
);
CREATE OR REPLACE FUNCTION public.has_schedule_permission(_user_id uuid, _schedule_id uuid, _action text default 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role) OR EXISTS (
    SELECT 1 FROM public.implementation_schedules s
    JOIN public.user_roles r ON r.user_id = _user_id
    WHERE s.id = _schedule_id AND s.workspace_id = public.current_workspace()
      AND CASE
        WHEN r.schedule_permissions ? _schedule_id::text THEN
          CASE WHEN _action = 'read' THEN r.schedule_permissions ->> _schedule_id::text IN ('read', 'write')
            ELSE r.schedule_permissions ->> _schedule_id::text = 'write' END
        ELSE r.screen_permissions @> jsonb_build_array(jsonb_build_object('screen','schedules','actions',jsonb_build_array(_action)))
          OR (_action = 'read' AND r.screen_permissions @> jsonb_build_array(jsonb_build_object('screen','schedules','actions',jsonb_build_array('write'))))
      END
  )
$$;
CREATE TABLE public.schedule_phases (
  id uuid primary key default gen_random_uuid(), schedule_id uuid not null references public.implementation_schedules(id),
  workspace_id uuid not null references public.workspaces(id), position integer not null default 0, title text not null,
  description text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
CREATE TABLE public.schedule_items (
  id uuid primary key default gen_random_uuid(), phase_id uuid not null references public.schedule_phases(id),
  workspace_id uuid not null references public.workspaces(id), position integer not null default 0, title text not null,
  description text, planned_date date, done_date date, status text not null default 'pending', assignee text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_phases, public.schedule_items TO authenticated;
ALTER TABLE public.schedule_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_phases_test_read ON public.schedule_phases FOR SELECT TO authenticated
  USING (public.has_schedule_permission(auth.uid(), schedule_id, 'read'));
CREATE POLICY schedule_items_test_read ON public.schedule_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.schedule_phases p WHERE p.id = phase_id AND public.has_schedule_permission(auth.uid(), p.schedule_id, 'read')));
CREATE POLICY schedule_items_test_update ON public.schedule_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.schedule_phases p WHERE p.id = phase_id AND public.has_schedule_permission(auth.uid(), p.schedule_id, 'write')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.schedule_phases p WHERE p.id = phase_id AND public.has_schedule_permission(auth.uid(), p.schedule_id, 'write')));
CREATE TABLE storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
CREATE OR REPLACE FUNCTION storage.foldername(_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(_name, '/')
$$;
`;

const db = new PGlite.PGlite();
const ADMIN = "11111111-1111-1111-1111-111111111111";
const SALES = "22222222-2222-2222-2222-222222222222";
const IMPLANTATION = "33333333-3333-3333-3333-333333333333";
const WORKSPACE = "44444444-4444-4444-4444-444444444444";
const SCHEDULE = "55555555-5555-5555-5555-555555555555";
const ASSESSMENT = "66666666-6666-6666-6666-666666666666";
const COMPANY_1 = "77777777-7777-7777-7777-777777777771";
const COMPANY_2 = "77777777-7777-7777-7777-777777777772";
const MODULE = "88888888-8888-8888-8888-888888888881";
const CATEGORY = "88888888-8888-8888-8888-888888888882";
const MIGRATION_GROUP = "88888888-8888-8888-8888-888888888883";
const DEMAND_CATEGORY = "88888888-8888-8888-8888-888888888884";
const EMITTER_TYPE = "88888888-8888-8888-8888-888888888885";

const setUser = async (uid) => db.exec(`SELECT set_config('test.uid', '${uid}', false)`);
const asAuthenticated = async (uid, callback) => {
  await setUser(uid);
  await db.exec("SET ROLE authenticated");
  try { return await callback(); }
  finally { await db.exec("RESET ROLE"); }
};
const expectFailure = async (callback, label) => {
  let failed = false;
  try { await callback(); } catch { failed = true; }
  assert.equal(failed, true, `${label} precisa ser bloqueado`);
};

await db.exec(shim);
await db.exec(`
  INSERT INTO public.workspaces (id, name) VALUES ('${WORKSPACE}', 'Implantação');
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'admin@example.invalid'), ('${SALES}', 'comercial@example.invalid'), ('${IMPLANTATION}', 'implantacao@example.invalid');
  INSERT INTO public.profiles (id, full_name, active_workspace_id) VALUES
    ('${ADMIN}', 'Admin', '${WORKSPACE}'), ('${SALES}', 'Ana Comercial', '${WORKSPACE}'), ('${IMPLANTATION}', 'Equipe Implantação', '${WORKSPACE}');
  INSERT INTO public.user_roles (user_id, role, screen_permissions, schedule_permissions) VALUES
    ('${ADMIN}', 'admin', '[]'::jsonb, '{}'::jsonb),
    ('${SALES}', 'member', '[{"screen":"commercial_assessments","actions":["read","write"]}]'::jsonb, '{}'::jsonb),
    ('${IMPLANTATION}', 'member', '[{"screen":"commercial_assessments_review","actions":["read","write"]}]'::jsonb, '{"${SCHEDULE}":"write"}'::jsonb);
  INSERT INTO public.implementation_schedules (id, workspace_id, client_name) VALUES ('${SCHEDULE}', '${WORKSPACE}', 'Grupo Horizonte');
`);
await db.exec(migration);
await db.exec(migration);

const catalogs = (await db.query("SELECT kind, count(*)::int AS count FROM public.commercial_assessment_catalog GROUP BY kind")).rows;
assert.equal(catalogs.find((row) => row.kind === "module")?.count, 14, "catálogo de módulos sem duplicação");
assert.equal(catalogs.find((row) => row.kind === "integration_category")?.count, 15, "catálogo de integração sem duplicação");
const option = async (kind, name) => {
  const result = await db.query("SELECT id FROM public.commercial_assessment_catalog WHERE workspace_id=$1 AND kind=$2 AND name=$3", [WORKSPACE, kind, name]);
  return result.rows[0]?.id;
};
const moduleCatalog = await option("module", "ERP");
const categoryCatalog = await option("integration_category", "Integrador de pedidos de e-commerce");
const migrationCatalog = await option("migration_group", "Produtos");
const demandCatalog = await option("demand_category", "Desenvolvimento");
const emitterCatalog = await option("emitter_type", "NF-e");

// Comercial cria o levantamento e os registros do cenário de aceite: dois CNPJs,
// mais de um módulo, hub de e-commerce, migração e customização ainda pendente.
await asAuthenticated(SALES, async () => {
  await db.query(`INSERT INTO public.commercial_assessments (id, workspace_id, schedule_id, client_name, sales_owner, surveyed_on)
    VALUES ($1,$2,$3,'Grupo Horizonte','Ana Comercial','2026-10-15')`, [ASSESSMENT, WORKSPACE, SCHEDULE]);
  await db.query(`INSERT INTO public.commercial_assessment_companies (id, assessment_id, workspace_id, legal_name, trade_name, cnpj, is_primary)
    VALUES ($1,$3,$4,'Horizonte Varejo Ltda.','Horizonte Varejo','12.345.678/0001-90',true),
           ($2,$3,$4,'Horizonte Varejo Filial Ltda.','Horizonte Varejo Filial','12.345.678/0002-70',false)`, [COMPANY_1, COMPANY_2, ASSESSMENT, WORKSPACE]);
  await db.query(`INSERT INTO public.commercial_assessment_modules (assessment_id, workspace_id, catalog_id, status)
    VALUES ($1,$2,$3,'contratado')`, [ASSESSMENT, WORKSPACE, moduleCatalog]);
  await db.query(`INSERT INTO public.commercial_assessment_emitters (assessment_id, workspace_id, company_id, document_type_id, status)
    VALUES ($1,$2,$3,$4,'contratado')`, [ASSESSMENT, WORKSPACE, COMPANY_1, emitterCatalog]);
  await db.query(`INSERT INTO public.commercial_assessment_integrations (assessment_id, workspace_id, name, category_id, contracted_status, status)
    VALUES ($1,$2,'Hub de pedidos do cliente',$3,'nao_contratada','analise_tecnica')`, [ASSESSMENT, WORKSPACE, categoryCatalog]);
  await db.query(`INSERT INTO public.commercial_assessment_migrations (assessment_id, workspace_id, data_group_id, necessary_status, preparation_status)
    VALUES ($1,$2,$3,'sim','solicitados')`, [ASSESSMENT, WORKSPACE, migrationCatalog]);
  const { rows: migrationRows } = await db.query(
    "SELECT id FROM public.commercial_assessment_migrations WHERE assessment_id=$1", [ASSESSMENT],
  );
  const migrationId = migrationRows[0].id;
  await db.query(`INSERT INTO public.commercial_assessment_files
    (assessment_id, workspace_id, migration_id, file_path, file_name, file_size, mime_type, uploaded_by)
    VALUES ($1,$2,$3,$4,'produtos.csv',128,'text/csv',$5)`,
  [ASSESSMENT, WORKSPACE, migrationId, `${ASSESSMENT}/arquivo-ficticio.csv`, SALES]);
  await db.query(`INSERT INTO public.commercial_assessment_dimensions
    (assessment_id, workspace_id, contracted_users, stores_or_branches)
    VALUES ($1,$2,12,2)`, [ASSESSMENT, WORKSPACE]);
  await db.query(`INSERT INTO public.commercial_assessment_infrastructure
    (assessment_id, workspace_id, question_key, answer, details)
    VALUES ($1,$2,'ecommerce_operation','sim','Operação integrada por hub')`, [ASSESSMENT, WORKSPACE]);
  await db.query(`INSERT INTO public.commercial_assessment_contacts
    (assessment_id, workspace_id, name, email)
    VALUES ($1,$2,'Joana Fictícia','joana@example.invalid')`, [ASSESSMENT, WORKSPACE]);
  await db.query(`INSERT INTO public.commercial_assessment_demands (assessment_id, workspace_id, title, category_id, custom_development, status)
    VALUES ($1,$2,'Relatório de margem por canal',$3,true,'aguardando_analise')`, [ASSESSMENT, WORKSPACE, demandCatalog]);
});

const companyCount = (await db.query("SELECT count(*)::int AS n FROM public.commercial_assessment_companies WHERE assessment_id=$1", [ASSESSMENT])).rows[0].n;
assert.equal(companyCount, 2, "duas empresas relacionadas ao mesmo levantamento");
const statusHistory = (await db.query("SELECT to_status FROM public.commercial_assessment_history WHERE assessment_id=$1 ORDER BY created_at", [ASSESSMENT])).rows;
assert.equal(statusHistory[0].to_status, "em_preenchimento", "a criação registra o primeiro evento do histórico");
await asAuthenticated(SALES, async () => {
  await expectFailure(() => db.query(`INSERT INTO public.schedule_phases (schedule_id, workspace_id, title)
    VALUES ($1,$2,'Não autorizada')`, [SCHEDULE, WORKSPACE]), "alteração de cronograma sem permissão de agenda");
});
let commercialPhaseId = "";
await asAuthenticated(IMPLANTATION, async () => {
  const { rows: phases } = await db.query(`INSERT INTO public.schedule_phases (schedule_id, workspace_id, title)
    VALUES ($1,$2,'Pré-implantação comercial') RETURNING id`, [SCHEDULE, WORKSPACE]);
  commercialPhaseId = phases[0].id;
  await expectFailure(() => db.query(`INSERT INTO public.schedule_items
    (phase_id, workspace_id, title, commercial_assessment_id, commercial_assessment_source)
    VALUES ($1,$2,'Levantamento técnico do hub',$3,'integration:hub:analysis')`,
  [commercialPhaseId, WORKSPACE, ASSESSMENT]), "atividade de cronograma antes da aprovação técnica");
});

await asAuthenticated(SALES, async () => {
  await expectFailure(() => db.query("UPDATE public.commercial_assessments SET status='aprovado_planejamento' WHERE id=$1", [ASSESSMENT]), "aprovação técnica por comercial");
  await expectFailure(() => db.query("UPDATE public.commercial_assessment_demands SET status='aprovada' WHERE assessment_id=$1", [ASSESSMENT]), "aprovação automática de demanda comercial");
  await db.query("UPDATE public.commercial_assessments SET status='pronto_analise' WHERE id=$1", [ASSESSMENT]);
});

await asAuthenticated(IMPLANTATION, async () => {
  await db.query("UPDATE public.commercial_assessments SET status='em_analise' WHERE id=$1", [ASSESSMENT]);
  await expectFailure(() => db.query("UPDATE public.commercial_assessments SET status='aprovado_planejamento' WHERE id=$1", [ASSESSMENT]), "aprovação sem checklist concluído");
  await db.query(`UPDATE public.commercial_assessments SET
    technical_review_checklist='{"scope":true,"dependencies":true,"gaps":true}'::jsonb,
    status='aprovado_planejamento' WHERE id=$1`, [ASSESSMENT]);
});
const approved = (await db.query("SELECT technical_review_completed, status FROM public.commercial_assessments WHERE id=$1", [ASSESSMENT])).rows[0];
assert.equal(approved.status, "aprovado_planejamento");
assert.equal(approved.technical_review_completed, true, "aprovação exige e registra checklist técnico");
await asAuthenticated(SALES, async () => {
  await expectFailure(() => db.query("UPDATE public.commercial_assessments SET status='em_preenchimento' WHERE id=$1", [ASSESSMENT]), "reabertura unilateral de levantamento aprovado");
  await expectFailure(() => db.query("UPDATE public.commercial_assessments SET status='aguardando_cliente' WHERE id=$1", [ASSESSMENT]), "retirada unilateral da aprovação para aguardar cliente");
  await expectFailure(() => db.query("UPDATE public.commercial_assessments SET status='aguardando_comercial' WHERE id=$1", [ASSESSMENT]), "retirada unilateral da aprovação para aguardar comercial");
});
const historyCount = Number((await db.query("SELECT count(*)::int AS n FROM public.commercial_assessment_history WHERE assessment_id=$1", [ASSESSMENT])).rows[0].n);
assert.equal(historyCount, 4, "histórico registra criação e cada mudança de status");

// A atividade é vinculada à origem e não pode duplicar a mesma fonte no cronograma.
await asAuthenticated(IMPLANTATION, async () => {
  await db.query(`INSERT INTO public.schedule_items (phase_id, workspace_id, title, commercial_assessment_id, commercial_assessment_source)
    VALUES ($1,$2,'Levantamento técnico do hub',$3,'integration:hub:analysis')`, [commercialPhaseId, WORKSPACE, ASSESSMENT]);
  await expectFailure(() => db.query(`INSERT INTO public.schedule_items (phase_id, workspace_id, title, commercial_assessment_id, commercial_assessment_source)
    VALUES ($1,$2,'Levantamento técnico do hub',$3,'integration:hub:analysis')`, [commercialPhaseId, WORKSPACE, ASSESSMENT]), "atividade duplicada da mesma origem");
  await db.query("UPDATE public.commercial_assessments SET status='em_analise' WHERE id=$1", [ASSESSMENT]);
  await db.query("UPDATE public.schedule_items SET description='Revisão de texto após reabertura' WHERE commercial_assessment_id=$1", [ASSESSMENT]);
  await expectFailure(() => db.query("UPDATE public.schedule_items SET commercial_assessment_source='integration:hub:revised' WHERE commercial_assessment_id=$1", [ASSESSMENT]), "alteração da origem sem nova aprovação");
});

// Um workspace diferente não lê os registros desta base.
await db.exec(`INSERT INTO public.workspaces (id, name) VALUES ('99999999-9999-9999-9999-999999999999', 'Outra base');`);
await db.exec(`INSERT INTO public.profiles (id, full_name, active_workspace_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Outra pessoa', '99999999-9999-9999-9999-999999999999');`);
await db.exec(`INSERT INTO auth.users (id, email) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'outra@example.invalid');`);
await db.exec(`INSERT INTO public.user_roles (user_id, role, screen_permissions) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','member','[{"screen":"commercial_assessments","actions":["read","write"]}]');`);
await asAuthenticated("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", async () => {
  const { rows } = await db.query("SELECT id FROM public.commercial_assessments WHERE id=$1", [ASSESSMENT]);
  assert.equal(rows.length, 0, "RLS não expõe levantamentos de outra base");
});

await db.close();
console.log("Levantamento Comercial SQL: catálogo, persistência relacional, RLS, fluxo de aprovação, histórico, cronograma e deduplicação passaram.");
