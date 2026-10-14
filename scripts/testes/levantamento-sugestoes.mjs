#!/usr/bin/env node
// node --experimental-strip-types scripts/testes/levantamento-sugestoes.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizarTexto, textosDasRespostas, termosEncontrados, sugestoesDeModulos,
  perguntasDoModulo, secoesPresentes, termosDoTexto,
} from '../../src/lib/surveyModulos.ts';

const MODULOS = [
  { code: 'comercial', name: 'Comercial', section: 'Comercial', optional: false, terms: [], position: 1 },
  { code: 'financeiro', name: 'Financeiro', section: 'Financeiro', optional: false, terms: [], position: 2 },
  { code: 'producao', name: 'Produção (PCP)', section: 'Produção', optional: true, terms: ['PCP', 'produção', 'MRP', 'ordem de produção', 'fábrica'], position: 3 },
  { code: 'estoque', name: 'Estoque', section: 'Estoque', optional: true, terms: ['estoque', 'inventário', 'almoxarifado'], position: 4 },
  { code: 'faturamento', name: 'Faturamento (fiscal)', section: 'Faturamento', optional: true, terms: ['NF-e', 'nota fiscal', 'SPED'], position: 5 },
  { code: 'pdv', name: 'PDV', section: 'PDV', optional: true, terms: ['PDV', 'NFC-e', 'frente de caixa'], position: 6 },
];

const BANCO = [
  { id: 'a', module_code: 'producao', position: 2, label: 'Segunda', help_text: null, type: 'text', options: [], required: false },
  { id: 'b', module_code: 'producao', position: 1, label: 'Primeira', help_text: 'dica', type: 'select', options: ['x', 'y'], required: true },
  { id: 'c', module_code: 'estoque', position: 1, label: 'Estoque 1', help_text: null, type: 'text', options: null, required: false },
];

test('normaliza sem acento, sem maiúsculas e com pontuação virando espaço', () => {
  assert.equal(normalizarTexto('Produção'), ' producao ');
  assert.equal(normalizarTexto('NF-e!'), ' nf e ');
  assert.equal(normalizarTexto(''), ' ');
});

test('termo encontrado independente de maiúscula e acento', () => {
  assert.deepEqual(termosEncontrados(['Usamos pcp no chão de fabrica'], ['PCP', 'fábrica']), ['PCP', 'fábrica']);
  assert.deepEqual(termosEncontrados(['temos PRODUÇÃO própria'], ['produção']), ['produção']);
});

test('termo não casa dentro de outra palavra', () => {
  // "pdv" não pode casar com "pdvs" nem "xpdv"; "mrp" não casa com "mrpx"
  assert.deepEqual(termosEncontrados(['temos pdvs e xpdv'], ['PDV']), []);
  assert.deepEqual(termosEncontrados(['mrpx'], ['MRP']), []);
});

test('termo com hífen casa com a forma sem hífen do texto digitado (NF-e / NF e)', () => {
  assert.deepEqual(termosEncontrados(['emitimos NF e todo dia'], ['NF-e']), ['NF-e']);
  assert.deepEqual(termosEncontrados(['emitimos nf-e todo dia'], ['NF-e']), ['NF-e']);
});

test('termos com várias palavras', () => {
  assert.deepEqual(termosEncontrados(['temos ordem de produção por lote'], ['ordem de produção']), ['ordem de produção']);
  assert.deepEqual(termosEncontrados(['temos ordem produção'], ['ordem de produção']), []);
});

test('texto vazio ou termo vazio não gera sugestão', () => {
  assert.deepEqual(termosEncontrados([], ['PCP']), []);
  assert.deepEqual(termosEncontrados(['PCP'], ['']), []);
});

test('pega texto das respostas: valor digitado, escolhas e listas', () => {
  const textos = textosDasRespostas([
    { value: 'Usamos PCP', value_json: null },
    { value: null, value_json: ['Pix', 'Boleto'] },
    { value: null, value_json: { a: 'fábrica própria' } },
    { value: '', value_json: null },
  ]);
  assert.deepEqual(textos, ['Usamos PCP', 'Pix', 'Boleto', 'fábrica própria']);
});

test('PCP nas respostas sugere Produção quando a seção não está no levantamento', () => {
  const sugestoes = sugestoesDeModulos({
    modulos: MODULOS,
    textos: ['Usamos PCP'],
    secoesNoLevantamento: new Set(['Comercial', 'Financeiro']),
    decididos: [],
  });
  assert.equal(sugestoes.length, 1);
  assert.equal(sugestoes[0].modulo.code, 'producao');
  assert.deepEqual(sugestoes[0].termos, ['PCP']);
});

test('sem termo citado, nada é sugerido', () => {
  const sugestoes = sugestoesDeModulos({
    modulos: MODULOS, textos: ['Vendemos pela internet'], secoesNoLevantamento: new Set(), decididos: [],
  });
  assert.deepEqual(sugestoes, []);
});

test('módulo já presente no levantamento não é sugerido de novo', () => {
  const sugestoes = sugestoesDeModulos({
    modulos: MODULOS, textos: ['Usamos PCP'], secoesNoLevantamento: new Set(['Produção']), decididos: [],
  });
  assert.deepEqual(sugestoes, []);
});

test('módulo recusado ou aceito antes não volta a ser sugerido', () => {
  const sugestoes = sugestoesDeModulos({
    modulos: MODULOS, textos: ['Usamos PCP'], secoesNoLevantamento: new Set(), decididos: ['producao'],
  });
  assert.deepEqual(sugestoes, []);
});

test('módulos obrigatórios (Comercial e Financeiro) nunca viram sugestão', () => {
  const sugestoes = sugestoesDeModulos({
    modulos: MODULOS, textos: ['Comercial financeiro'], secoesNoLevantamento: new Set(), decididos: [],
  });
  assert.deepEqual(sugestoes, []);
});

test('várias sugestões saem na ordem do módulo', () => {
  const sugestoes = sugestoesDeModulos({
    modulos: MODULOS,
    textos: ['Temos PDV e controle de estoque e usamos PCP'],
    secoesNoLevantamento: new Set(),
    decididos: [],
  });
  assert.deepEqual(sugestoes.map((s) => s.modulo.code), ['producao', 'estoque', 'pdv']);
});

test('perguntas do módulo saem na ordem e herdam a seção do módulo', () => {
  const perguntas = perguntasDoModulo(MODULOS[2], BANCO);
  assert.deepEqual(perguntas.map((p) => p.label), ['Primeira', 'Segunda']);
  assert.equal(perguntas[0].section, 'Produção');
  assert.deepEqual(perguntas[0].options, ['x', 'y']);
  assert.equal(perguntas[0].required, true);
  assert.deepEqual(perguntasDoModulo(MODULOS[3], BANCO)[0].options, [], 'options nulas viram lista vazia');
});

test('seções presentes vêm das perguntas do levantamento', () => {
  const s = secoesPresentes([{ section: 'Comercial' }, { section: null }, { section: 'PDV' }]);
  assert.deepEqual([...s].sort(), ['Comercial', 'PDV']);
});

test('termos digitados viram lista limpa, sem repetição', () => {
  assert.deepEqual(termosDoTexto(' PCP, produção ; MRP\nPCP,, '), ['PCP', 'produção', 'MRP']);
  assert.deepEqual(termosDoTexto('pcp, PCP'), ['pcp']);
  assert.deepEqual(termosDoTexto(''), []);
});
