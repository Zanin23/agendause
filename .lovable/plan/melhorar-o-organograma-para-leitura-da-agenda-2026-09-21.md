# Melhorar o organograma para leitura da agenda

## Objetivo
Transformar o organograma atual em uma visão operacional: identificar rapidamente cada fase, quais etapas possuem visita marcada, quando ocorrerão e o que está atrasado, pendente ou concluído.

## Alterações
- Reorganizar o desenho em faixas por fase, reduzindo cruzamentos e o excesso de espaço entre etapas.
- Exibir nos cartões da etapa a data prevista e, quando houver vínculo, a data e o horário da visita agendada.
- Destacar visualmente etapas com visita, atrasadas, concluídas, bloqueadas e sem agendamento.
- Adicionar um resumo fixo com progresso, quantidade de visitas vinculadas e próxima visita.
- Incluir filtros rápidos para mostrar tudo, somente visitas, pendências ou concluídos, além de busca por etapa.
- Permitir clicar em uma etapa vinculada para abrir a visita correspondente na agenda.
- Ajustar controles, mapa e dimensões para navegação mais confortável no computador e no celular.

## Detalhes técnicos
- Ampliar a consulta do organograma para carregar `training_id` e os dados relacionados de `trainings`.
- Criar nós tipados para fases e etapas, usando apenas tokens visuais do sistema.
- Calcular indicadores e filtros no navegador, sem alterar dados ou regras do cronograma.
- Manter o organograma somente para visualização; nenhuma etapa ou visita será alterada nessa tela.

## Validação
- Abrir um cronograma real com etapas vinculadas e conferir datas, horários, progresso, filtros e navegação para a visita.
- Conferir o enquadramento e a legibilidade em desktop e celular.
- Validar tipos do projeto após as mudanças.
