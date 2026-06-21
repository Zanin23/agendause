
# Módulo de Cronograma de Implantação

Novo módulo para criar, editar e acompanhar cronogramas de implantação do ERP USE. Cada cronograma é criado a partir de um **template padrão** (baseado no documento enviado) e fica **100% editável**: fases, itens, datas, responsáveis, status e observações.

## Funções planejadas

**Criação**
- Botão "Novo Cronograma" no Dashboard → wizard com: cliente, data de início, responsável Use Sistemas, equipe de implantação, modalidade (presencial/remoto/híbrido), cadência (semanal/quinzenal).
- Geração automática das **17 fases padrão** com seus itens (Reunião de Alinhamento → Relatórios Gerenciais Financeiro). Datas sugeridas calculadas a partir da data de início e da cadência.

**Edição**
- Reordenar fases (drag & drop) e itens dentro de cada fase.
- Adicionar, renomear, duplicar e remover fases/itens livremente.
- Editar datas previstas e realizadas, responsável por item, status (pendente / em andamento / concluído / bloqueado / reagendado), observação por item.
- Marcar itens como "não aplicável" (mantém histórico sem contar no progresso).

**Acompanhamento**
- Barra de progresso geral e por fase (% de itens concluídos).
- Vista Kanban (status) e vista Timeline/Gantt simplificada por fase.
- Próximas visitas técnicas em destaque, alertas de itens atrasados.
- Histórico de alterações (quem mudou o quê e quando).

**Colaboração**
- Comentários por item (equipe Use ↔ cliente).
- Link público (token) para o cliente acompanhar somente leitura, similar ao GuestAccept atual.
- Aceite digital do cronograma pelo cliente (assinatura/checkbox + IP/data), reaproveitando o padrão de `training_acceptances`.

**Saídas**
- Exportar para PDF (layout próximo do .docx enviado, com logo, fases numeradas e observações padrão).
- Exportar para .ics (cada item vira evento de agenda) e CSV.
- Imprimir versão A4 amigável (rota `/cronograma/:id/print`).

**Templates**
- Template "Padrão ERP USE" pré-carregado (conteúdo do documento enviado).
- Possibilidade de salvar variações como novos templates (ex.: "ERP USE - Indústria", "ERP USE - Comércio") para reuso.

**Observações padrão** já incluídas em cada novo cronograma (visitas podem se estender, feedbacks via WhatsApp, melhorias entram em fila de desenvolvimento, feriados podem alterar datas, adiantamentos passam por análise) — editáveis.

## Detalhes técnicos

**Banco (Lovable Cloud)** — novas tabelas em `public`:
- `implementation_templates` (id, name, description, is_default, content jsonb, owner_id)
- `implementation_schedules` (id, client_name, start_date, cadence, modality, use_team text[], owner_id, status, public_token, accepted_at, accepted_by, accepted_ip)
- `schedule_phases` (id, schedule_id, position, title)
- `schedule_items` (id, phase_id, position, title, description, planned_date, done_date, status, assignee, notes)
- `schedule_comments` (id, item_id, author_id, body)
- `schedule_history` (id, schedule_id, actor_id, action, payload jsonb)

Todas com RLS escopada por `owner_id = auth.uid()`, GRANTs explícitos para `authenticated` e `service_role`, leitura `anon` apenas via `public_token` (RPC `get_schedule_by_token`). Triggers `updated_at` reaproveitando `public.update_updated_at_column`.

**Frontend (React + Vite + Tailwind + shadcn)**:
- Rotas: `/cronogramas` (lista), `/cronogramas/novo`, `/cronogramas/:id` (editor), `/cronogramas/:id/print`, `/c/:token` (visão pública do cliente).
- Componentes: `ScheduleEditor`, `PhaseCard`, `ItemRow`, `ProgressBar`, `KanbanView`, `TimelineView`, `TemplatePicker`, `PublicScheduleView`.
- Drag & drop com `@dnd-kit/core` (adicionar dependência).
- Export PDF via `jspdf` + `jspdf-autotable` (já leve), ICS gerado client-side.
- Seed do template padrão executado no primeiro carregamento se `implementation_templates` estiver vazio para o usuário.

**SEO/Header**: entrada "Cronogramas" no `AppHeader`, SEO por rota via componente `SEO` existente.

## Fora do escopo desta entrega
- Integração real com WhatsApp/Email automático (fica como gancho futuro).
- App mobile dedicado (a versão web já é responsiva).
