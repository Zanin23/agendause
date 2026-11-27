# Responsáveis pelos atendimentos — cadastro nas Configurações

Desde novembro/2026 é possível gerenciar, pela tela **Configurações → Responsáveis pelos atendimentos**, quem pode ser atribuído como responsável pelos treinamentos e visitas de cada base — sem mexer em código.

## Como estava antes

A lista de responsáveis era fixa no código e no banco (Matheus Zanin, Pablo Cassiano, João Pedro e Claudinei). Para atribuir mais alguém era preciso alterar a função `list_workspace_training_responsibles` e as validações no banco.

## Como funciona agora

- A **lista padrão do sistema** continua valendo (os quatro nomes, quando pertencem à base ativa) e não pode ser removida.
- **Administradores** cadastram responsáveis extras na tela de Configurações, em dois formatos:
  - **Usuário da base** — escolhem um membro da base que ainda não está na lista (o vínculo usa o perfil dele; vale para qualquer pessoa com login).
  - **Nome livre** — digitam um nome, sem criar acesso ao sistema (útil para parceiros e terceiros que atendem junto).
- Administradores também podem **renomear** o rótulo exibido e **arquivar/restaurar** alguém. Arquivada, a pessoa não aparece em novos agendamentos; o nome continua no histórico e ela pode ser restaurada a qualquer momento.
- As pessoas cadastradas aparecem como opção em todo lugar que pede responsável (criar treinamento, editar responsáveis no detalhe do treinamento). Membros comuns veem e selecionam; só administradores gerenciam a lista.

## Ativação (obrigatória, uma única vez)

O recurso depende de uma migração que **administrador do banco roda manualmente**:

1. SQL Editor do projeto no Supabase → **New query**;
2. cole o conteúdo de `supabase/migrations/20261127120000_responsaveis_atendimentos.sql`;
3. **Run**. É idempotente (pode rodar de novo sem estragar nada);
4. confirme que terminou com `NOTIFY pgrst, 'reload schema'` — e recarregue o app.

Sem a migração, a tela avisa que o cadastro ainda não foi ativado e nada quebra: a lista padrão continua funcionando normalmente.

## O que a migração faz

- Cria a tabela `workspace_responsibles` (cadastro por base ativa; `profile_id` vinculado = usuário, `NULL` = nome livre);
- acrescenta `workspace_responsible_id` em `training_responsibles` e troca a chave primária para um `id` próprio, com índices únicos parciais (cada treinamento não repete a mesma pessoa) e a regra “exatamente um dos dois tipos de responsável por linha”;
- atualiza `list_workspace_training_responsibles()` para devolver a lista padrão **mais o cadastro** da base, com a coluna `archived` (o app usa para esconder arquivados de novos agendamentos, sem perder o histórico);
- atualiza `create_training_with_responsibles` e `set_training_responsibles` para aceitar usuários e pessoas livres no mesmo array (`_responsible_user_ids`);
- cria as RPCs de administração, todas exigindo `has_role(..., 'admin')`:
  `list_workspace_responsibles`, `list_workspace_responsible_candidates`,
  `create_workspace_responsible`, `rename_workspace_responsible`,
  `set_workspace_responsible_archived`;
- reforça as mesmas regras nos gatilhos (inclusive gravações feitas fora da interface).

## Teste automatizado

`scripts/testes/responsaveis-atendimentos-sql.mjs` valida o fluxo inteiro num
PostgreSQL real (PGlite) com as migrações anteriores aplicadas antes:

```bash
npm install --no-save @electric-sql/pglite
node scripts/testes/responsaveis-atendimentos-sql.mjs
```

## Perguntas frequentes

**Preciso cadastrar os quatro da lista padrão?** Não. Eles continuam disponíveis automaticamente em qualquer base da qual participem.

**Arquivei alguém sem querer, e agora?** Em Configurações → Responsáveis pelos atendimentos → “Arquivados (n)” → **Restaurar**. O histórico nunca é perdido.

**Posso excluir definitivamente um nome livre?** Não há exclusão definitiva nesta versão, de propósito: apagar removeria o nome do histórico dos atendimentos. Arquivar cumpre o papel de “sumir da seleção” sem perder o passado.

**Quanto vale para outras bases?** O cadastro é por base ativa — cada base tem a sua lista.
