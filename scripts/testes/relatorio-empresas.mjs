#!/usr/bin/env node
/* ============================================================================
   Testes da leitura/comparação de empresas do relatório
   (src/lib/relatorioEmpresas.ts) — a base da tela "Empresas perdidas".

   Rodar na raiz do repositório, com Node 22.6+ (usa --experimental-strip-types):

     node --experimental-strip-types scripts/testes/relatorio-empresas.mjs
   ============================================================================ */

/* Testes da biblioteca de comparação (src/lib/relatorioEmpresas.ts) */
const aqui = new URL(".", import.meta.url);
const lib = await import(new URL("../../src/lib/relatorioEmpresas.ts", aqui).href);
let falhas = 0;
const ok = (t, c, e = "") => { console.log(`${c ? "  ok  " : "  FALHA"} ${t}${e ? ` — ${e}` : ""}`); if (!c) falhas++; };

/* 1) exportação do site do relatório */
const exportacao = {
  app: "relatorio-implantacoes", versao: 1, data: "2026-10-08",
  geradoEm: "2026-10-09T18:00:00.000Z",
  empresas: [
    { id: "ngriffe-48jso", nome: "Griffe", status: "cliente", progresso: 45, tipo: "Nova implantação", feito: ["a"], falta: ["b"], fases: [["done",""],["na",""]] },
    { nome: "Água Viva", status: "andamento", progresso: 20 },            // sem id -> calculado
    { id: "nantiga-xyz", nome: "Empresa Que Sumiu", status: "risco", progresso: 70, cronograma: [{ atividade: "x" }] },
  ],
};
const lido = lib.lerEmpresas(JSON.stringify(exportacao));
ok("lê a exportação do relatório", lido.documentos.length === 3, `${lido.documentos.length} empresa(s)`);
ok("formato reconhecido", lido.formato === "exportação do relatório", lido.formato);
ok("meta do levantamento lida", lido.meta?.data === "2026-10-08", JSON.stringify(lido.meta));
ok("empresa sem id ganha o id do relatório", lido.documentos[1].id === lib.idDeNome("Água Viva"), lido.documentos[1].id);

/* 2) dados.js (baseline do repositório do relatório) */
const dadosjs = `/* comentário */\nwindow.DADOS_INICIAIS = ${JSON.stringify({ data: "2026-10-08", empresas: [{ nome: "Raguso", progresso: 50, status: "cliente" }] }, null, 2)};\n`;
const lidoJs = lib.lerEmpresas(dadosjs);
ok("lê dados.js com comentário", lidoJs.documentos.length === 1 && lidoJs.documentos[0].dados.nome === "Raguso", lidoJs.formato);

/* 3) linhas da tabela documentos */
const linhas = [{ id: "nr-1", dados: { nome: "X", status: "andamento" }, ordem: 3 }];
const lidoLinhas = lib.lerEmpresas(JSON.stringify({ documentos: linhas }));
ok("lê linhas de documentos (ordem preservada)", lidoLinhas.documentos[0].ordem === 3 && lidoLinhas.documentos[0].dados.nome === "X", lidoLinhas.formato);

/* 4) comparação */
const atuais = [
  { id: "ngriffe-48jso", dados: { nome: "Griffe" }, ordem: 0 },
  { id: "nagua-viva-whxsgp", dados: { nome: "Água Viva" }, ordem: 1 },   // mesmo nome, id igual ao calculado
  { id: "nralo-999", dados: { nome: "Ralo" }, ordem: 2 },               // só aqui
];
const comp = lib.compararEmpresas(lido.documentos, atuais);
ok("acha 1 perdida", comp.perdidas.length === 1, comp.perdidas.map((p) => p.dados.nome).join(", "));
ok("a perdida é a certa", comp.perdidas[0]?.dados.nome === "Empresa Que Sumiu");
ok("conta as presentes", comp.presentes.length === 2, String(comp.presentes.length));
ok("acha a exclusiva do banco de agora", comp.extras.length === 1 && comp.extras[0].dados.nome === "Ralo");

/* 5) nome com acento/variação: mesma empresa, id diferente */
const comp2 = lib.compararEmpresas(
  [{ id: "nagua-viva-000", dados: { nome: "ÁGUA VIVA " }, ordem: 0 }],
  [{ id: "nagua-viva-whxsgp", dados: { nome: "Água Viva" }, ordem: 0 }],
);
ok("junta a mesma empresa por nome (acento/maiúscula)", comp2.perdidas.length === 0 && comp2.presentes[0].situacao === "id-diferente", comp2.presentes[0]?.situacao);

/* 6) restauração */
const preparadas = lib.prepararRestauracao(comp.perdidas, { ordemInicial: 10, trazerCronograma: false });
ok("prepara a linha para gravar", preparadas.length === 1 && preparadas[0].ordem === 10, JSON.stringify(preparadas.map((p) => p.ordem)));
ok("sem cronograma quando pedido", preparadas[0].dados.cronograma === undefined);
ok("com cronograma por padrão", lib.prepararRestauracao(comp.perdidas, {})[0].dados.cronograma?.length === 1);
ok("mantém a ordem original quando pedido", lib.prepararRestauracao(comp.perdidas, { manterOrdemOriginal: true, ordemInicial: 99 })[0].ordem === 2);

/* 7) CSV */
const csv = lib.perdidasParaCsv(comp.perdidas);
ok("gera CSV com cabeçalho e empresa", csv.startsWith('"id","nome"') && csv.includes("Empresa Que Sumiu"), `${csv.split("\n").length} linha(s)`);

/* 8) entradas erradas não quebram */
let erro = "";
try { lib.lerEmpresas("nada disso"); } catch (e) { erro = e.message; }
ok("texto inválido dá erro claro", erro.includes("JSON") || erro.includes("empresas"), erro.slice(0, 60));

console.log(falhas === 0 ? "\n✔ Biblioteca ok." : `\n✖ ${falhas} falha(s).`);
process.exit(falhas ? 1 : 0);
