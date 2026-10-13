#!/usr/bin/env node
/* ============================================================================
   Testes da tradução dos erros de login (src/lib/authErrors.ts).

   O caso que originou isto: quando o servidor de login responde 5xx, o cliente
   do Supabase monta a mensagem com `JSON.stringify(response)` e a tela mostrava
   literalmente `{}` — sem dizer nada a quem tentava entrar. Agora o `{}` nunca
   aparece: vira explicação (servidor fora / projeto pausado) com o próximo
   passo, e o e-mail/senha continuam distintos de problema de servidor.

   Como rodar:
     node --experimental-strip-types scripts/testes/erros-de-login.mjs
   ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ehStatusDeInfra,
  explicarErroDeLogin,
  extrairErroAuth,
  mensagemDeJson,
  mensagemInutil,
  mensagemServidorFora,
} from "../../src/lib/authErrors.ts";

const ctx = { projeto: "psgekwifthuzduhpreay", painel: "https://supabase.com/dashboard/project/psgekwifthuzduhpreay" };

/* Erro real do cliente do Supabase quando o servidor responde 5xx:
   nome AuthRetryableFetchError, mensagem JSON.stringify(Response) = "{}". */
const erroDeServidor = (status) =>
  Object.assign(new Error("{}"), { name: "AuthRetryableFetchError", status });

test('o caso da tela: 503 com mensagem "{}" vira explicação e nunca mostra {}', () => {
  const msg = explicarErroDeLogin(erroDeServidor(503), ctx);
  assert.ok(!msg.includes("{}"), `a mensagem não pode conter {}: ${msg}`);
  assert.match(msg, /fora do ar|instável/i);
  assert.match(msg, /não da sua senha/i);
  assert.match(msg, /pausado/i);
  assert.match(msg, /Restore\/Resume/);
  assert.match(msg, /psgekwifthuzduhpreay/);
  assert.match(msg, /Verificar o acesso/);
});

test("todos os códigos de infraestrutura caem na mesma explicação", () => {
  for (const status of [500, 502, 503, 504, 520, 522, 530]) {
    const msg = explicarErroDeLogin(erroDeServidor(status), ctx);
    assert.ok(!msg.includes("{}"), `status ${status} mostrou {}`);
    assert.match(msg, new RegExp(`erro ${status}`), `status ${status} não apareceu na mensagem`);
  }
  assert.equal(ehStatusDeInfra(503), true);
  assert.equal(ehStatusDeInfra(400), false);
  assert.equal(ehStatusDeInfra(undefined), false);
});

test('erro sem detalhe e sem status (o "{}" puro) também vira frase útil', () => {
  const msg = explicarErroDeLogin(new Error("{}"));
  assert.ok(!msg.includes("{}"));
  assert.match(msg, /sem detalhes/i);
  assert.match(msg, /Verificar o acesso/);
});

test("resposta JSON sem campo conhecido não vaza para a tela", () => {
  for (const mensagem of ["{}", "[]", "[object Object]", "  "]) {
    const msg = explicarErroDeLogin(Object.assign(new Error(mensagem), { status: 400 }));
    assert.ok(!msg.includes("{}"), `vazou: ${msg}`);
    assert.match(msg, /sem detalhes/i);
  }
});

test("quando o JSON traz informação, ela é aproveitada", () => {
  const msg = explicarErroDeLogin(
    Object.assign(new Error('{"code":"invalid_credentials","message":"Invalid login credentials"}'), { status: 400 }),
  );
  assert.match(msg, /E-mail ou senha não conferem/);
});

test("credenciais erradas continuam com a explicação de sempre", () => {
  const msg = explicarErroDeLogin(
    Object.assign(new Error("Invalid login credentials"), { name: "AuthApiError", status: 400, code: "invalid_credentials" }),
  );
  assert.match(msg, /E-mail ou senha não conferem neste banco/);
  assert.match(msg, /Esqueci minha senha/);
});

test("e-mail não confirmado, rate limit, Google e cadastro fechado", () => {
  assert.match(explicarErroDeLogin(Object.assign(new Error("Email not confirmed"), { code: "email_not_confirmed" })), /não foi confirmado/);
  assert.match(explicarErroDeLogin(Object.assign(new Error("Too many requests"), { status: 429, code: "over_request_rate_limit" })), /Muitas tentativas/);
  assert.match(explicarErroDeLogin(new Error("Unsupported provider: provider is not enabled")), /Google ainda não está habilitado/);
  assert.match(explicarErroDeLogin(new Error("Signups not allowed for this instance")), /cadastro público está desativado/);
  assert.match(explicarErroDeLogin(new Error("User not found")), /Não existe conta com este e-mail/);
  assert.match(explicarErroDeLogin(new Error("Password should be at least 6 characters")), /pelo menos 6 caracteres/);
});

test("queda de rede (fetch failed) não é confundida com senha errada", () => {
  for (const texto of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "fetch failed"]) {
    const msg = explicarErroDeLogin(new TypeError(texto));
    assert.match(msg, /Não foi possível falar com o servidor de login/);
    assert.ok(!/senha não confere/i.test(msg));
  }
});

test("extrairErroAuth aceita Error, objeto cru e string", () => {
  assert.deepEqual(extrairErroAuth(new Error("falhou")), { nome: "Error", mensagem: "falhou", status: undefined, codigo: undefined });
  assert.deepEqual(
    extrairErroAuth({ name: "AuthApiError", message: "x", status: 400, code: "invalid_credentials" }),
    { nome: "AuthApiError", mensagem: "x", status: 400, codigo: "invalid_credentials" },
  );
  assert.deepEqual(extrairErroAuth("texto puro"), { nome: "", mensagem: "texto puro" });
  assert.deepEqual(extrairErroAuth(undefined), { nome: "", mensagem: "" });
  assert.equal(extrairErroAuth({ error_description: "descrição" }).mensagem, "descrição");
});

test("helpers de mensagem inútil/JSON", () => {
  assert.equal(mensagemInutil("{}"), true);
  assert.equal(mensagemInutil("[]"), true);
  assert.equal(mensagemInutil("[object Object]"), true);
  assert.equal(mensagemInutil(""), true);
  assert.equal(mensagemInutil("Invalid login credentials"), false);
  assert.equal(mensagemDeJson('{"message":"vem daqui"}'), "vem daqui");
  assert.equal(mensagemDeJson('{"error_description":"ou daqui"}'), "ou daqui");
  assert.equal(mensagemDeJson("{não é json}"), "");
  assert.equal(mensagemDeJson("texto"), "");
});

test("mensagemServidorFora cita o painel e o projeto quando recebe o contexto", () => {
  const msg = mensagemServidorFora(503, ctx);
  assert.match(msg, /https:\/\/supabase\.com\/dashboard\/project\/psgekwifthuzduhpreay/);
  const semCtx = mensagemServidorFora(undefined);
  assert.match(semCtx, /painel do Supabase/);
  assert.ok(!semCtx.includes("undefined"));
});
