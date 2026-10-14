# Levantamento de processos

O levantamento é o questionário da aba **Levantamento** de um cronograma. Ele
serve para descobrir como a empresa trabalha antes da implantação.

## Antes de usar: publicar o SQL (uma vez só)

Rode no Supabase (projeto `pnaupodddxrbqbjilhft`, Agendause), **antes** de
publicar o site:

1. `supabase/migrations/20261014150000_levantamento_modulos_e_perguntas_padrao.sql`

A migração cria as tabelas do padrão (`survey_modules` e
`survey_template_questions`), adiciona `process_surveys.decided_modules` e
carrega o padrão inicial (6 módulos e 25 perguntas). Se ela já tiver sido
rodada, pode rodar de novo: é idempotente e não recarrega perguntas.

Sem a migração, a aba mostra o erro "Não foi possível carregar o padrão de
perguntas" e não cria levantamentos com perguntas.

## Módulos

| Módulo | Tipo | Entra ao criar o levantamento? |
| --- | --- | --- |
| Comercial | obrigatório | sim |
| Financeiro | obrigatório | sim |
| Produção (PCP) | opcional | não — entra por sugestão ou manualmente |
| Estoque | opcional | não — entra por sugestão ou manualmente |
| Faturamento (fiscal) | opcional | não — entra por sugestão ou manualmente |
| PDV | opcional | não — entra por sugestão ou manualmente |

## Sugestões (nunca automáticas)

Quando uma resposta cita um termo de um módulo opcional, a aba mostra o aviso
**"Sugestões para o levantamento"**, por exemplo:

> Foi citado “PCP” nas respostas. Inserir o módulo **Produção (PCP)** no levantamento?

- **Sim, inserir** — acrescenta as perguntas do módulo ao final do
  levantamento.
- **Não** — dispensa a sugestão neste levantamento. Ela não volta.

Os dois botões gravam o código do módulo em `process_surveys.decided_modules`.
Por isso, uma sugestão decidida não reaparece naquele levantamento.

Também é possível inserir um módulo opcional direto pelo botão, no painel
**Módulos opcionais**.

Os termos são comparados sem acento, sem maiúsculas e com pontuação virando
espaço. Eles só casam com palavra inteira: "PCP" não casa dentro de outra
palavra.

As sugestões só aparecem enquanto o levantamento não foi respondido, e só para
quem pode editar o cronograma.

## Editar o padrão de perguntas

Somente administradores editam o padrão, em **Controle de Acessos → Perguntas
do levantamento** (rota `/admin/levantamento-padrao`). Lá é possível:

- mudar o nome, a seção e se o módulo é opcional;
- editar os termos de sugestão (separados por vírgula);
- criar, editar, apagar e reordenar perguntas de cada módulo.

As mudanças valem para **levantamentos novos** e para **módulos inseridos
depois**. Levantamentos já criados não mudam: as perguntas deles são cópias.

Os módulos são fixos (não dá para criar ou apagar módulos pela tela). Para
criar um módulo novo, é preciso uma migração.

## Código

- `src/lib/surveyModulos.ts` — lógica pura: termos, sugestões, perguntas do
  módulo e tipos de pergunta.
- `src/components/SurveyTab.tsx` — aba do levantamento.
- `src/pages/SurveyBankEditor.tsx` — tela de administração do padrão.

## Testes

```bash
# SQL da migração num PostgreSQL de verdade (PGlite)
npm install --no-save --no-audit --no-fund @electric-sql/pglite
node scripts/testes/levantamento-modulos-sql.mjs

# Sugestões e termos (lógica pura)
node --experimental-strip-types scripts/testes/levantamento-sugestoes.mjs
```

O teste SQL só é válido se a saída terminar com "todos os testes passaram".
Sem o PGlite instalado, o script não testa nada.
