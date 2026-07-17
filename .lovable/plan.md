## Diagnóstico

A pré-visualização está saindo empilhada (uma coluna por linha) e em retrato porque:

1. A media query `@media (max-width: 767px)` está definida **depois** do `@media print` e força `grid-template-columns: 1fr` — como o Chrome usa a largura da janela de preview do PDF (estreita), a regra mobile vence a de impressão e destrói o grid de 5 colunas.
2. O `@page { size: A4 landscape }` funciona, mas o diálogo "Guardar como PDF" do Chrome ignora a orientação declarada em CSS se o usuário não a definir manualmente — por isso continua em retrato.
3. As alturas fixas (`200mm`) que forcei na tentativa anterior brigam com o layout empilhado e cortam conteúdo.

## Opções de visualização (escolha uma)

### Opção A — Paisagem, grade de 5 colunas (espelha a tela)
Layout idêntico ao da agenda na tela: 5 colunas lado a lado, cabeçalho + logo no topo, tudo comprimido em 1 folha A4 paisagem.
- Prós: familiar, mostra a semana inteira "de relance".
- Contras: cards ficam pequenos; observações longas podem truncar.

### Opção B — Retrato, 5 colunas estreitas
Mesmo grid de 5 colunas, mas em A4 retrato (colunas mais estreitas e altas).
- Prós: mais espaço vertical por dia → cabem mais eventos sem truncar.
- Contras: texto dos cards fica bem estreito.

### Opção C — Retrato, 2 colunas × linhas (dias empilhados em pares)
Segunda/Terça na 1ª linha, Quarta/Quinta na 2ª, Sexta sozinha na 3ª.
- Prós: cards grandes e legíveis, boa hierarquia.
- Contras: não é o mesmo "formato calendário" da tela.

### Opção D — Paisagem, tabela compacta (linhas = eventos, colunas = dia/hora/cliente/tipo/local)
Formato de lista/relatório em vez de calendário.
- Prós: garantidamente cabe em 1 folha, fácil de ler impresso.
- Contras: perde o visual de "agenda semanal".

## Correção técnica (aplicada em qualquer opção)

- Envolver as regras mobile em `@media (max-width: 767px) and not print` **ou** mover o bloco `@media print` para o final do `<style>` para vencer por ordem.
- Remover as alturas fixas em `mm` que estavam cortando conteúdo; usar apenas `page-break-inside: avoid` + `overflow: hidden` no `main`.
- Manter `@page { size: A4 <orientação>; margin: 5mm }` conforme a opção.
- Instrução visível na toolbar: "No diálogo de impressão, selecione orientação = <Paisagem/Retrato>" (o Chrome exige seleção manual).

Responda com **A**, **B**, **C** ou **D** que eu implemento.