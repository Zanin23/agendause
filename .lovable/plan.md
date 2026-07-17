# Impressão da agenda idêntica à visualização

## Objetivo
Fazer com que a impressão (papel A4 e o PDF exportado) da tela `PrintAgenda` fique **pixel-a-pixel igual** ao layout Bento assimétrico já exibido na tela, sem reformatar cores, tipografia, colunas, sombras, badges ou legenda.

## Diagnóstico
Hoje há divergências entre tela e impressão:
- As regras `@media print` alteram o layout (removem sombras/raios, escondem elementos, mudam paddings).
- O `.agenda-paper` tem largura de 1200px enquanto a folha A4 paisagem tem ~277mm úteis, então o navegador quebra as 5 colunas ou corta o conteúdo.
- O export em PDF via `html2canvas` captura só um pedaço do DOM.

## Estratégia
Tratar a "página impressa" como um **snapshot fiel** da tela: uma única frame com o mesmo DOM/estilo e apenas escalado para caber em uma folha A4 paisagem.

### Passo 1 — Unificar o CSS
- Remover todas as sobrescritas do `@media print` que mudam visual (sombras, raios, cores, bordas).
- Manter no `@media print` apenas: esconder `.no-print`, `.agenda-tip`, controlar quebras de página e definir `@page`.
- O `.agenda-paper` continua com sombra deslocada, cabeçalho, footer e legend idênticos à tela.

### Passo 2 — Escalar para caber em uma folha A4 paisagem
- Envolver o `.agenda-paper` num wrapper `.print-frame` com largura fixa de 1200px (mesma da tela) e altura calculada para proporção A4 paisagem.
- No `@media print`:
  - `@page { size: A4 landscape; margin: 0; }`
  - Aplicar `transform: scale(<fator>)` ao `.print-frame` para reduzir 1200px → ~1123px (largura útil A4 landscape a 96dpi) e `transform-origin: top left`.
  - Forçar `body { width: 297mm; height: 210mm; overflow: hidden; }` para garantir uma única página.

### Passo 3 — Corrigir o export em PDF
- Trocar a captura do `html2canvas` para o nó exato `.print-frame` (ou `.agenda-paper`) com `scale: 2`, `useCORS: true`, `backgroundColor: '#F7EFE1'`.
- Gerar o PDF em A4 paisagem e desenhar a imagem inteira em uma única página respeitando a proporção (`imgWidth = pageWidth`, `imgHeight = imgWidth * ratio`).
- Remover a lógica atual que fatia por altura (não haverá mais múltiplas páginas).

### Passo 4 — Ajustes visuais menores
- Garantir que `-webkit-print-color-adjust: exact` esteja no `body` e nas cores de fundo dos badges/legend para preservar cores.
- Deixar as sombras deslocadas visíveis na impressão (parte da identidade Bento).
- Manter o rodapé com "Gerado em …" também na versão impressa.

## Arquivos a alterar
- `src/pages/PrintAgenda.tsx`
  - Envolver o `<main>` do papel num wrapper `.print-frame`.
  - Reescrever o bloco `<style>{...}</style>` com as novas regras `@media print` (mínimas) e a escala.
  - Reescrever `exportPDF` para captura de um único frame proporcional.

## Fora de escopo
- Não alterar dados, RLS, rotas, hooks ou o layout da tela (que já é o modelo aprovado).
- Não mexer em outras telas.
