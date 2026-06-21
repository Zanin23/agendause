
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.schedule_item_status AS ENUM ('pending','in_progress','done','blocked','rescheduled','not_applicable');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_modality AS ENUM ('presencial','remoto','hibrido');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_cadence AS ENUM ('semanal','quinzenal','mensal','customizada');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============ TEMPLATES ============
CREATE TABLE public.implementation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_global boolean NOT NULL DEFAULT false,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implementation_templates TO authenticated;
GRANT ALL ON public.implementation_templates TO service_role;
ALTER TABLE public.implementation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own or global templates" ON public.implementation_templates
  FOR SELECT TO authenticated USING (is_global = true OR owner_id = auth.uid());
CREATE POLICY "Insert own templates" ON public.implementation_templates
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Update own templates" ON public.implementation_templates
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Delete own templates" ON public.implementation_templates
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER implementation_templates_updated_at BEFORE UPDATE ON public.implementation_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SCHEDULES ============
CREATE TABLE public.implementation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  client_email text,
  start_date date NOT NULL,
  cadence public.schedule_cadence NOT NULL DEFAULT 'semanal',
  modality public.schedule_modality NOT NULL DEFAULT 'presencial',
  use_team text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'draft',
  observations text,
  public_token text UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  accepted_at timestamptz,
  accepted_by text,
  accepted_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.implementation_schedules TO authenticated;
GRANT ALL ON public.implementation_schedules TO service_role;
ALTER TABLE public.implementation_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages schedules" ON public.implementation_schedules
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER implementation_schedules_updated_at BEFORE UPDATE ON public.implementation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PHASES ============
CREATE TABLE public.schedule_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.implementation_schedules(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_phases TO authenticated;
GRANT ALL ON public.schedule_phases TO service_role;
ALTER TABLE public.schedule_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages phases" ON public.schedule_phases
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.implementation_schedules s WHERE s.id = schedule_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.implementation_schedules s WHERE s.id = schedule_id AND s.owner_id = auth.uid()));
CREATE INDEX schedule_phases_schedule_idx ON public.schedule_phases(schedule_id, position);
CREATE TRIGGER schedule_phases_updated_at BEFORE UPDATE ON public.schedule_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ITEMS ============
CREATE TABLE public.schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES public.schedule_phases(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  planned_date date,
  done_date date,
  status public.schedule_item_status NOT NULL DEFAULT 'pending',
  assignee text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_items TO authenticated;
GRANT ALL ON public.schedule_items TO service_role;
ALTER TABLE public.schedule_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages items" ON public.schedule_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.schedule_phases p
    JOIN public.implementation_schedules s ON s.id = p.schedule_id
    WHERE p.id = phase_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.schedule_phases p
    JOIN public.implementation_schedules s ON s.id = p.schedule_id
    WHERE p.id = phase_id AND s.owner_id = auth.uid()));
CREATE INDEX schedule_items_phase_idx ON public.schedule_items(phase_id, position);
CREATE TRIGGER schedule_items_updated_at BEFORE UPDATE ON public.schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ COMMENTS ============
CREATE TABLE public.schedule_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_comments TO authenticated;
GRANT ALL ON public.schedule_comments TO service_role;
ALTER TABLE public.schedule_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads comments" ON public.schedule_comments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.schedule_items it
    JOIN public.schedule_phases p ON p.id = it.phase_id
    JOIN public.implementation_schedules s ON s.id = p.schedule_id
    WHERE it.id = item_id AND s.owner_id = auth.uid()));
CREATE POLICY "Owner writes comments" ON public.schedule_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.schedule_items it
    JOIN public.schedule_phases p ON p.id = it.phase_id
    JOIN public.implementation_schedules s ON s.id = p.schedule_id
    WHERE it.id = item_id AND s.owner_id = auth.uid()));
CREATE POLICY "Owner deletes comments" ON public.schedule_comments
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- ============ PUBLIC TOKEN ACCESS RPC ============
CREATE OR REPLACE FUNCTION public.get_schedule_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'schedule', to_jsonb(s.*),
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'position', p.position, 'title', p.title, 'description', p.description,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', it.id, 'position', it.position, 'title', it.title, 'description', it.description,
            'planned_date', it.planned_date, 'done_date', it.done_date,
            'status', it.status, 'assignee', it.assignee, 'notes', it.notes
          ) ORDER BY it.position)
          FROM public.schedule_items it WHERE it.phase_id = p.id
        ), '[]'::jsonb)
      ) ORDER BY p.position)
      FROM public.schedule_phases p WHERE p.schedule_id = s.id
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.implementation_schedules s
  WHERE s.public_token = _token;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.get_schedule_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_schedule_by_token(_token text, _name text, _ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.implementation_schedules
  SET accepted_at = now(), accepted_by = _name, accepted_ip = _ip, status = 'accepted'
  WHERE public_token = _token AND accepted_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_schedule_by_token(text, text, text) TO anon, authenticated;

-- ============ GLOBAL DEFAULT TEMPLATE ============
INSERT INTO public.implementation_templates (name, description, is_default, is_global, content) VALUES (
  'Padrão ERP USE',
  'Cronograma padrão de implantação do sistema USE Sistemas',
  true, true,
  '{
    "observations": "• Visitas técnicas de implantação podem se estender por mais de um dia.\n• A cada visita técnica, receber feedback do operador em relação ao escopo previsto e transmitir de forma clara e objetiva via grupo do WhatsApp.\n• Melhorias recebidas através de feedbacks serão adicionadas a fila de desenvolvimento, passando por análise técnica do desenvolvimento e do setor comercial.\n• Feriados, datas e situações pontuais podem interferir no cronograma, podendo estender-se as datas de implantação.\n• Solicitações de adiantamento de visitas técnicas/entregas passarão por análise da equipe interna USE Sistemas, podendo ser aprovadas ou não.",
    "phases": [
      {"title":"Reunião de Alinhamento do Cronograma","items":["Use Sistemas, equipe de Implantação (Matheus Zanin, Claudinei da Silva e Pablo Cassiano)"]},
      {"title":"Instalação do Banco de Dados","items":["Instalação e configuração de banco","Parametrização do sistema","Cadastro das empresas e unidades de negócios"]},
      {"title":"Cadastros Iniciais — Setor Comercial","items":["Instalação do sistema nos terminais","Cadastro dos usuários","Configuração das permissões de usuários","Cadastro de Representantes","Cadastro de Fornecedores","Cadastro de Clientes","Configuração dos tipos de pedidos","Reunião plano de contas e financeiro"]},
      {"title":"Cadastro de Produtos","items":["Cadastro Grupo / Subgrupo / Classe de Produtos","Amarração das contas receitas nos grupos de produtos","Cadastro de Matéria-Prima","Cadastro de Produto Acabado"]},
      {"title":"Estoque","items":["Entrada de nota fiscal manual e por XML","Inventário e relatório de posição de estoque","Movimentação manual de entrada e saída","Baixas por requisição","Relatório de necessidade de compras","Solicitação, aprovação e emissão de cotação","Pedido de compras e aprovação","Entrada por nota com XML amarrando pedido de compras"]},
      {"title":"Emissão de Orçamentos e Pedidos","items":["Emissão de Orçamentos","Emissão de Pedidos","Ficha de Custo","Monta Notas de Faturamento","Monta Notas de Remessa"]},
      {"title":"Produção","items":["Cadastro das receitas","Ordem de Produção","OS Terceiros","Baixa de requisições","Passagens para estoque","Relatórios de produção"]},
      {"title":"Cadastros Financeiros","items":["Cadastros de contas financeiras e tipos de documentos","Lançamentos títulos do Receber e do Pagar","Lançamentos adiantamentos de Clientes e Fornecedores"]},
      {"title":"Configuração de Faturamento","items":["Instalação das dependências NF-e","Cadastro e ajuste de sequência do Talão de Notas","Configuração de Tributação","Emissão de Nota em Homologação"]},
      {"title":"Faturamento","items":["Monta notas de faturamento, remessa e conserto","Emissão de notas por pedido e pela abertura de Faturamento","Emissão de notas manuais, devolução de compra e de venda"]},
      {"title":"Movimentações Financeiras","items":["Relatório posição geral de títulos do Receber e do Pagar","Liquidação Simples do Receber e do Pagar","Liquidação usando Adiantamentos e documentos de terceiros","Liquidação gerando outros documentos","Emissão de Boletos"]},
      {"title":"Tesouraria","items":["Cadastro de contas bancárias","Lançamentos de movimentos bancários","Conciliação bancária","Emissão de cheques e controle"]},
      {"title":"Apuração e Fiscal","items":["Apuração de impostos","Geração de SPED Fiscal e Contribuições","Conferência de notas de entrada e saída"]},
      {"title":"Relatórios Gerenciais — Comercial","items":["Vendas por período, vendedor e cliente","Clientes: relatório, inatividade e comunicação","Comissão por Gestor, Representante e Pedidos"]},
      {"title":"Relatórios Gerenciais — Estoque","items":["Posição de estoque e extrato de produto","Notas de entrada e relatório de requisições","Movimentações de estoque"]},
      {"title":"Relatórios Gerenciais — Financeiro e Tesouraria","items":["Posição geral de Títulos do Receber e do Pagar","Adiantamentos de Clientes e Fornecedores","Tradição de Clientes e Fornecedores","Conciliação/consulta de cheques e extrato financeiro","Apuração de resultados"]},
      {"title":"Treinamento Final e Go-Live","items":["Revisão geral de processos","Treinamento operacional final","Acompanhamento Go-Live","Sign-off do cliente"]}
    ]
  }'::jsonb
);
