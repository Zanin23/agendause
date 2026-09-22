# Aba de Clientes — histórico e saúde da implantação

Uma nova tela **Clientes** que reúne, por empresa, tudo o que já aconteceu: visitas agendadas, treinamentos realizados, levantamento de processos respondido e o andamento do cronograma — com indicadores visuais de atraso e relatório por cliente.

## Lista de clientes

- Busca por nome e filtros por situação: em dia, atenção, atrasado, concluído.
- Cada cliente em um cartão com:
  - Nome da empresa e data de início da implantação
  - Barra de progresso do cronograma (etapas concluídas / total)
  - Próxima visita marcada e última visita realizada
  - Situação do levantamento: não criado, aguardando cliente, respondido
  - Selo de saúde do prazo: verde (em dia), amarelo (etapas vencendo), vermelho (etapas com data prevista passada e ainda pendentes)
  - Aviso quando existem datas pedidas pelo cliente aguardando confirmação
- Ordenação por risco (mais atrasados primeiro) ou por nome.

## Painel do cliente

Ao abrir um cliente, quatro blocos:

1. **Resumo visual** — cartões com total de visitas, horas de treinamento, etapas concluídas/pendentes/atrasadas, dias desde o início e previsão de término. Gráfico de barras de visitas por mês e gráfico de rosca por tipo de visita (presencial, interno, remoto).
2. **Histórico de visitas** — linha do tempo com data, título, tipo, duração, situação (agendada, concluída, cancelada, aguardando confirmação), quem pediu a data, participantes que assinaram o aceite e a descrição/conteúdo do treinamento. Clicar abre a visita.
3. **Levantamento de processos** — situação, quem respondeu, data de envio, contagem de respostas e anexos, respostas por seção em formato de leitura, e atalho para o relatório completo já existente.
4. **Cronograma** — fases com progresso, etapas atrasadas destacadas, atalhos para o cronograma, o organograma e o link do cliente.

## Relatórios interativos

- Visão geral no topo da lista: quantos clientes em cada faixa de saúde, média de atraso em dias, levantamentos pendentes, visitas da semana — cada número clicável, aplicando o filtro correspondente.
- Botão **Imprimir / salvar PDF** no painel do cliente, gerando um dossiê com resumo, histórico de visitas com conteúdo e respostas do levantamento.

## Detalhes técnicos

- Nova rota `/clientes` (lista) e `/clientes/:scheduleId` (painel), protegidas por `ProtectedRoute`, com `usePermissions` (`hasScreenPermission('clients')`, liberado para admin) e respeitando a base ativa via RLS.
- Agrupamento por cliente usando `implementation_schedules.client_name` como chave, cruzando: `schedule_phases`/`schedule_items` (progresso, atraso por `planned_date < hoje` e `status <> 'done'`), `trainings` (por `client`, incluindo `visit_type`, `approval_status`, `duration_minutes`, `description`), `training_acceptances`/`guest_acceptances` (participantes) e `process_surveys` + `survey_questions`/`survey_answers`/`survey_files`.
- Gráficos com `recharts` (já usado pelo shadcn `chart`), cores via tokens semânticos do `index.css` — sem cores fixas.
- Card de acesso à nova tela na home (`HomeExperimental.tsx`) e atalho no cabeçalho da lista de cronogramas.
- Sem mudanças de banco: apenas consultas de leitura sobre as tabelas existentes.
