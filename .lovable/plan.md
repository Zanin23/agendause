## Múltiplos workspaces ("bases de dados")

Cria duas bases lógicas — **Implantação** e **Waldemar** — isoladas em todos os módulos, com seleção obrigatória no primeiro acesso, persistência por usuário e uma aba de **Configurações** para trocar a base ativa.

### Conceito

Um único banco real continua sendo usado. A separação é feita por uma coluna `workspace_id` em cada tabela do app, combinada com RLS que filtra por workspace. Cada usuário tem uma associação `(user_id, workspace_id)` indicando a quais bases ele tem acesso, e uma preferência de "base ativa".

### Backend (migração)

1. Nova tabela `workspaces` (`id`, `slug`, `name`). Insere `implantacao` e `waldemar`.
2. Nova tabela `workspace_members` (`workspace_id`, `user_id`, `role`) — controla acesso por base.
3. Nova coluna `active_workspace_id` em `profiles` — preferência atual.
4. Adiciona coluna `workspace_id uuid` (NOT NULL após backfill) em:
   - `trainings`, `training_attachments`, `training_acceptances`, `training_reschedules`
   - `implementation_schedules`, `implementation_templates`, `schedule_phases`, `schedule_items`, `schedule_comments`
   - `billing_requests`, `billing_request_updates`, `billing_notification_settings`
   - `company_notes`
   - `guest_acceptances`
5. **Backfill**: todos os registros existentes recebem o `workspace_id` de **Implantação**. Todos os usuários atuais ganham acesso a **Implantação** e a **Waldemar** (já que pediu para poder alternar nas configurações), com Implantação como ativa.
6. Função `current_workspace()` `SECURITY DEFINER` que lê `profiles.active_workspace_id` do `auth.uid()`.
7. Atualiza **todas** as policies RLS dessas tabelas para exigir `workspace_id = current_workspace()` além das regras atuais de propriedade. INSERTs passam a exigir o workspace ativo.
8. Triggers `BEFORE INSERT` que preenchem `workspace_id` automaticamente com `current_workspace()` quando não enviado pelo cliente — evita ter de alterar cada `insert` no frontend.
9. Ajusta as RPCs existentes (`get_schedule_by_token`, `accept_schedule_by_token`, `get_public_training*`) para continuarem públicas (links de aceite não dependem de workspace ativo).

### Frontend

- **Hook `useWorkspace`**: lê `profiles.active_workspace_id` + lista de workspaces do usuário, expõe `switchWorkspace(id)`.
- **Tela "Selecionar base"** (`/selecionar-base`): aparece logo após login se nenhuma base ativa estiver definida. Mostra cards "Implantação" e "Waldemar" (apenas as que o usuário tem acesso).
- **`ProtectedRoute`**: se usuário logado e sem `active_workspace_id`, redireciona para `/selecionar-base`.
- **AppHeader**: badge discreto com o nome da base ativa, clicável para abrir Configurações.
- **Página `/configuracoes`**: card "Base de dados ativa" com seletor + ação de trocar; ao trocar, invalida o cache do React Query e recarrega.
- Adiciona card "Configurações" na Home.
- Atualiza queries existentes para invalidar quando `workspace_id` muda (chave de query inclui workspace ativo, garantindo dados frescos ao alternar).

### Detalhes técnicos

- Workspaces ficam visíveis para `authenticated` somente via `workspace_members` (membership-based RLS).
- Coluna `workspace_id` começa como `NULL`, backfill, depois `ALTER COLUMN SET NOT NULL` no mesmo migration.
- Policies serão **dropadas e recriadas** para incluir o filtro de workspace — não há `ALTER POLICY` ampla disponível.
- `guest_acceptances` e tabelas com acesso anônimo continuam abertas pelas RPCs existentes; o `workspace_id` é gravado via trigger no insert anônimo, usando o workspace do schedule/training relacionado.
- A query do dashboard de "próximos treinamentos", relatórios, etc., não muda em código — o filtro vem da RLS.

### Riscos

- Backfill grande de policies: revisão cuidadosa no migration. Caso uma policy nova quebre algum fluxo, ajustamos pontualmente.
- Após a migração, qualquer novo módulo precisará incluir `workspace_id` + trigger.

Aprovar para eu rodar o migration e implementar o frontend.