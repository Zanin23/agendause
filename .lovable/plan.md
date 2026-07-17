## Objetivo

Reverter os estilos `@media print` em `src/pages/PrintAgenda.tsx` ao formato original (mensagem #12), que era o correto: A4 paisagem simples, sem `transform: scale`, sem forçar largura de 1240px, sem `visibility: hidden` no body.

## Alterações

**`src/pages/PrintAgenda.tsx`** — Substituir o bloco `@media print` atual pelo estilo original:

```css
@media print {
  .no-print { display: none !important; }
  @page { size: A4 landscape; margin: 10mm; }
  body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .agenda-day { break-inside: avoid; page-break-inside: avoid; }
  .agenda-event { break-inside: avoid; page-break-inside: avoid; }
  .agenda-tip { display: none !important; }
}
```

Removendo:
- `body * { visibility: hidden }` / `.agenda-page * { visibility: visible }`
- `position: absolute`, `width: 1240px`, `height: 793px`, `overflow: hidden`
- `transform: scale(0.905)`
- Override forçado de `.agenda-grid` (deixa o Tailwind `sm:grid-cols-5` cuidar)

Mantém o restante do arquivo (header, grid on-screen, legenda, drag-and-drop) intacto.

## Resultado esperado

A impressão volta a sair como na primeira versão: A4 paisagem, layout renderizado no tamanho natural do CSS de impressão (sem escala forçada), com as 5 colunas dos dias e quebras de página respeitadas.