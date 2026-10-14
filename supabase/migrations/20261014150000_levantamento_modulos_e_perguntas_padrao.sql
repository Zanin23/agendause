-- ============================================================================
-- LEVANTAMENTO DE PROCESSOS — módulos e perguntas padrão editáveis
--
-- O que muda:
--   · survey_modules: os módulos do levantamento (Comercial, Financeiro,
--     Produção/PCP, Estoque, Faturamento, PDV). Os opcionais (optional = true)
--     não entram no levantamento novo por padrão: o sistema sugere inseri-los
--     quando os termos de `terms` aparecem nas respostas.
--   · survey_template_questions: as perguntas padrão de cada módulo. Antes elas
--     ficavam no código (src/lib/surveyTemplate.ts); agora são editáveis pela
--     tela de administração. Mudanças valem para levantamentos novos e para
--     módulos inseridos depois — levantamentos já criados não mudam.
--   · process_surveys.decided_modules: módulos sugeridos que o consultor já
--     aceitou ou recusou neste levantamento (para a sugestão não voltar).
--
-- Permissões: todo usuário logado lê; só administradores gravam.
-- Publicação: SQL Editor do projeto pnaupodddxrbqbjilhft → Run. Idempotente.
-- Os dados iniciais são as 25 perguntas do padrão atual; a carga só acontece
-- se a tabela estiver vazia.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.survey_modules (
  code text PRIMARY KEY,
  name text NOT NULL,
  section text NOT NULL,
  optional boolean NOT NULL DEFAULT true,
  terms text[] NOT NULL DEFAULT '{}'::text[],
  position integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.survey_template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code text NOT NULL REFERENCES public.survey_modules(code) ON UPDATE CASCADE ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  help_text text,
  type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.process_surveys
  ADD COLUMN IF NOT EXISTS decided_modules text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.survey_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_template_questions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.survey_modules, public.survey_template_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.survey_modules, public.survey_template_questions TO authenticated;
GRANT ALL ON public.survey_modules, public.survey_template_questions TO service_role;

DROP POLICY IF EXISTS "auth view survey modules" ON public.survey_modules;
DROP POLICY IF EXISTS "admin write survey modules" ON public.survey_modules;
DROP POLICY IF EXISTS "auth view survey template questions" ON public.survey_template_questions;
DROP POLICY IF EXISTS "admin write survey template questions" ON public.survey_template_questions;

CREATE POLICY "auth view survey modules" ON public.survey_modules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write survey modules" ON public.survey_modules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "auth view survey template questions" ON public.survey_template_questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write survey template questions" ON public.survey_template_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Dados iniciais (idempotentes)
INSERT INTO public.survey_modules (code, name, section, optional, terms, position) VALUES
  ($q$comercial$q$, $q$Comercial$q$, $q$Comercial$q$, false, '{}'::text[], 1),
  ($q$financeiro$q$, $q$Financeiro$q$, $q$Financeiro$q$, false, '{}'::text[], 2),
  ($q$producao$q$, $q$Produção (PCP)$q$, $q$Produção$q$, true, ARRAY[$q$PCP$q$, $q$produção$q$, $q$MRP$q$, $q$ordem de produção$q$, $q$fábrica$q$, $q$apontamento$q$]::text[], 3),
  ($q$estoque$q$, $q$Estoque$q$, $q$Estoque$q$, true, ARRAY[$q$estoque$q$, $q$inventário$q$, $q$almoxarifado$q$, $q$WMS$q$, $q$armazém$q$]::text[], 4),
  ($q$faturamento$q$, $q$Faturamento (fiscal)$q$, $q$Faturamento$q$, true, ARRAY[$q$NF-e$q$, $q$NFe$q$, $q$nota fiscal$q$, $q$NFS-e$q$, $q$SPED$q$, $q$faturamento$q$]::text[], 5),
  ($q$pdv$q$, $q$PDV$q$, $q$PDV$q$, true, ARRAY[$q$PDV$q$, $q$NFC-e$q$, $q$frente de caixa$q$, $q$ponto de venda$q$, $q$cashback$q$]::text[], 6)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.survey_template_questions (module_code, position, label, help_text, type, options, required)
SELECT v.module_code, v.position, v.label, v.help_text, v.type, v.options, v.required
FROM (VALUES
  ($q$comercial$q$, 1, $q$Qual o tipo de produto que vocês comercializam? A empresa industrializa, revende ou faz os dois?$q$, NULL, $q$select$q$, $q$["Industrialização", "Revenda", "Industrialização e revenda"]$q$::jsonb, true),
  ($q$comercial$q$, 2, $q$Hoje existem muitos controles feitos fora do sistema (planilhas, cadernos, aplicativos à parte)?$q$, $q$Se existirem, conte quais são e para que servem.$q$, $q$longtext$q$, $q$[]$q$::jsonb, true),
  ($q$comercial$q$, 3, $q$Como é composta a equipe de vendas? Há vendedores internos, externos, representantes?$q$, $q$Informe a quantidade de pessoas em cada caso.$q$, $q$longtext$q$, $q$[]$q$::jsonb, true),
  ($q$comercial$q$, 4, $q$De que forma os pedidos dos representantes chegam até a empresa hoje?$q$, $q$Ex.: WhatsApp, e-mail, telefone, portal, aplicativo próprio.$q$, $q$longtext$q$, $q$[]$q$::jsonb, true),
  ($q$comercial$q$, 5, $q$Vocês controlam ficha de custos dos produtos?$q$, NULL, $q$select$q$, $q$["Sim, no sistema atual", "Sim, em planilha", "Não controlamos"]$q$::jsonb, true),
  ($q$comercial$q$, 6, $q$Tabelas de preço e políticas de desconto em uso atualmente (anexar arquivo, se houver)$q$, NULL, $q$file$q$, $q$[]$q$::jsonb, false),
  ($q$financeiro$q$, 1, $q$Como vocês pagam os fornecedores hoje?$q$, $q$Selecione todas as formas utilizadas.$q$, $q$multiselect$q$, $q$["Pix", "Boleto (código de barras / DDA)", "Transferência / TED", "Cheque próprio", "Cheque de terceiros", "Dinheiro", "Cartão"]$q$::jsonb, true),
  ($q$financeiro$q$, 2, $q$Como vocês recebem dos clientes?$q$, NULL, $q$multiselect$q$, $q$["Boleto", "Pix", "Cartão de crédito", "Cartão de débito", "Cheque", "Dinheiro", "Carteira / cobrança própria"]$q$::jsonb, true),
  ($q$financeiro$q$, 3, $q$Vocês controlam limite de crédito por cliente?$q$, NULL, $q$boolean$q$, $q$[]$q$::jsonb, true),
  ($q$financeiro$q$, 4, $q$A empresa faz desconto de documentos (factoring ou banco)?$q$, $q$Se sim, informe com quais instituições.$q$, $q$longtext$q$, $q$[]$q$::jsonb, false),
  ($q$financeiro$q$, 5, $q$Quais bancos a empresa utiliza e há necessidade de remessa/retorno de boletos?$q$, NULL, $q$longtext$q$, $q$[]$q$::jsonb, false),
  ($q$estoque$q$, 1, $q$A empresa faz controle de estoque hoje?$q$, NULL, $q$select$q$, $q$["Sim, no sistema", "Sim, em planilha", "Controle parcial", "Não controlamos"]$q$::jsonb, true),
  ($q$estoque$q$, 2, $q$Existe controle por lote, validade ou número de série?$q$, NULL, $q$multiselect$q$, $q$["Lote", "Validade", "Número de série", "Não se aplica"]$q$::jsonb, false),
  ($q$estoque$q$, 3, $q$Vocês utilizam pedido de compra para abastecer o estoque?$q$, NULL, $q$boolean$q$, $q$[]$q$::jsonb, true),
  ($q$estoque$q$, 4, $q$Quantos depósitos ou locais de estoque existem?$q$, NULL, $q$number$q$, $q$[]$q$::jsonb, false),
  ($q$estoque$q$, 5, $q$Relação de produtos / cadastro atual para importação (anexar planilha)$q$, NULL, $q$file$q$, $q$[]$q$::jsonb, false),
  ($q$producao$q$, 1, $q$Atualmente a empresa faz controle da produção?$q$, $q$Se sim, explique como é feito hoje (ordem de produção, apontamento, ficha técnica).$q$, $q$longtext$q$, $q$[]$q$::jsonb, true),
  ($q$producao$q$, 2, $q$Vocês produzem com terceirizados?$q$, NULL, $q$select$q$, $q$["Sim, parte da produção", "Sim, toda a produção", "Não"]$q$::jsonb, false),
  ($q$producao$q$, 3, $q$Na emissão de notas e boletos existe muito retrabalho entre produção e financeiro?$q$, $q$Descreva onde hoje o processo trava ou precisa ser refeito.$q$, $q$longtext$q$, $q$[]$q$::jsonb, false),
  ($q$faturamento$q$, 1, $q$Quais documentos fiscais a empresa emite?$q$, NULL, $q$multiselect$q$, $q$["NF-e", "NFC-e", "NFS-e", "CT-e", "MDF-e", "NF de devolução", "Outros"]$q$::jsonb, true),
  ($q$faturamento$q$, 2, $q$É necessário gerar SPED (Fiscal / Contribuições)?$q$, NULL, $q$select$q$, $q$["Sim, geramos internamente", "Sim, a contabilidade gera", "Não"]$q$::jsonb, true),
  ($q$faturamento$q$, 3, $q$Contato do responsável pela parte fiscal/contábil$q$, $q$Nome, telefone e e-mail.$q$, $q$text$q$, $q$[]$q$::jsonb, false),
  ($q$pdv$q$, 1, $q$A empresa emite NFC-e no ponto de venda?$q$, NULL, $q$boolean$q$, $q$[]$q$::jsonb, false),
  ($q$pdv$q$, 2, $q$Há controle de cashback ou programa de fidelidade?$q$, $q$Se sim, explique como funcionam as regras hoje.$q$, $q$longtext$q$, $q$[]$q$::jsonb, false),
  ($q$pdv$q$, 3, $q$Quantos caixas / pontos de venda existem?$q$, NULL, $q$number$q$, $q$[]$q$::jsonb, false)
) AS v(module_code, position, label, help_text, type, options, required)
WHERE NOT EXISTS (SELECT 1 FROM public.survey_template_questions);

COMMIT;
