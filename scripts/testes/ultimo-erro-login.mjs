#!/usr/bin/env node
/* ============================================================================
   Testes de src/lib/ultimoErroLogin.ts e do código do servidor na mensagem.

   Por que existem: o erro de login some ao recarregar a página, e o Supabase às
   vezes responde só com um código (sem texto). Sem guardar isso, o diagnóstico
   não ajuda quem vai investigar — foi o caso do "erro 500" que voltou mesmo com
   o teste de login dizendo que o servidor estava de pé.

   Como rodar:
     node --experimental-strip-types scripts/testes/ultimo-erro-login.mjs
   ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  descreverErroDeLogin,
  lerUltimoErroDeLogin,
  limparUltimoErroDeLogin,
  registrarErroDeLogin,
} from "../../src/lib/ultimoErroLogin.ts";
import { mensagemServidorFora } from "../../src/lib/authErrors.ts";

/** Armazenamento de mentira (o teste não depende de navegador). */
const criarArmazenamento = () => {
  const dados = new Map();
  return {
    dados,
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => void dados.set(k, String(v)),
    removeItem: (k) => void dados.delete(k),
  };
};

test("registrar e ler o último erro (com status, código e projeto)", () => {
  const a = criarArmazenamento();
  registrarErroDeLogin(
    { mensagem: "O servidor de login está fora do ar", status: 500, codigo: "unexpected_failure", projeto: "pnaupodddxrbqbjilhft", quando: "2026-10-13T19:12:00.000Z" },
    a,
  );
  const lido = lerUltimoErroDeLogin(a);
  assert.equal(lido.status, 500);
  assert.equal(lido.codigo, "unexpected_failure");
  assert.equal(lido.projeto, "pnaupodddxrbqbjilhft");
  assert.equal(lido.quando, "2026-10-13T19:12:00.000Z");
  assert.match(lido.mensagem, /fora do ar/);
});

test("sem erro registrado, a leitura é nula (e não inventa nada)", () => {
  assert.equal(lerUltimoErroDeLogin(criarArmazenamento()), null);
});

test("conteúdo corrompido não quebra a tela", () => {
  const a = criarArmazenamento();
  a.setItem("treinacheck:ultimo-erro-de-login", "{isso não é json}");
  assert.equal(lerUltimoErroDeLogin(a), null);

  a.setItem("treinacheck:ultimo-erro-de-login", '{"status":500}');
  assert.equal(lerUltimoErroDeLogin(a), null, "sem mensagem, não é um registro válido");
});

test("quando a data não vem, o registro continua válido", () => {
  const a = criarArmazenamento();
  registrarErroDeLogin({ mensagem: "falhou" }, a);
  const lido = lerUltimoErroDeLogin(a);
  assert.equal(lido.mensagem, "falhou");
  assert.ok(lido.quando, "registrar preenche a data sozinho");
  assert.equal(lido.status, undefined);
});

test("limpar apaga o registro", () => {
  const a = criarArmazenamento();
  registrarErroDeLogin({ mensagem: "falhou" }, a);
  limparUltimoErroDeLogin(a);
  assert.equal(lerUltimoErroDeLogin(a), null);
});

test("armazenamento que lança (modo privado) não derruba o login", () => {
  const explosivo = {
    getItem: () => { throw new Error("bloqueado"); },
    setItem: () => { throw new Error("bloqueado"); },
    removeItem: () => { throw new Error("bloqueado"); },
  };
  assert.doesNotThrow(() => registrarErroDeLogin({ mensagem: "x" }, explosivo));
  assert.doesNotThrow(() => limparUltimoErroDeLogin(explosivo));
  assert.equal(lerUltimoErroDeLogin(explosivo), null);
});

test("sem navegador (localStorage ausente), nada explode", () => {
  assert.doesNotThrow(() => registrarErroDeLogin({ mensagem: "x" }));
  assert.equal(lerUltimoErroDeLogin(), null);
});

test("a descrição mostra data, status e código", () => {
  const texto = descreverErroDeLogin({
    quando: "2026-10-13T19:12:00.000Z",
    mensagem: "O servidor de login está fora do ar",
    status: 500,
    codigo: "unexpected_failure",
  });
  assert.match(texto, /erro 500 · unexpected_failure/);
  assert.match(texto, /fora do ar/);
  assert.match(texto, /\d{2}\/\d{2}\/\d{4}/, "a data aparece em formato brasileiro");
});

test("a descrição não escreve 'undefined' quando falta status ou código", () => {
  const semNada = descreverErroDeLogin({ quando: "", mensagem: "falhou" });
  assert.equal(semNada, "falhou");
  const soStatus = descreverErroDeLogin({ quando: "", mensagem: "falhou", status: 500 });
  assert.match(soStatus, /erro 500 — falhou$/);
  assert.ok(!soStatus.includes("undefined"));
});

test("a mensagem de servidor fora cita o código do Supabase quando existe", () => {
  const comCodigo = mensagemServidorFora(500, { projeto: "pnaupodddxrbqbjilhft" }, "unexpected_failure");
  assert.match(comCodigo, /\(erro 500 · unexpected_failure\)/);
  assert.match(comCodigo, /não da sua senha/);
  const semCodigo = mensagemServidorFora(503, { projeto: "pnaupodddxrbqbjilhft" });
  assert.match(semCodigo, /\(erro 503\)/);
  assert.ok(!semCodigo.includes("undefined"));
  assert.ok(!semCodigo.includes("·"));
});
