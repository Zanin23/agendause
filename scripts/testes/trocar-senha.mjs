#!/usr/bin/env node
/* ============================================================================
   Testes de src/lib/trocarSenha.ts — a troca da própria senha (Configurações).

   O que precisa continuar valendo:
     1. o formulário é validado antes de falar com o servidor;
     2. a senha ATUAL é confirmada antes de trocar (ninguém troca a senha de uma
        sessão aberta num computador alheio) e, se ela não confere, NADA é
        gravado;
     3. a senha nova é gravada uma única vez, com a atual enviada junto;
     4. os erros do Supabase viram frases úteis (senha comum, curta, longa...);
     5. a dica de força não mente (senha comum não pode aparecer como "Forte").

   Como rodar:
     node --experimental-strip-types scripts/testes/trocar-senha.mjs
   ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TAMANHO_MAXIMO,
  TAMANHO_MINIMO,
  classificarForca,
  explicarErroDeSenha,
  trocarSenhaDeAcesso,
  validarTrocaDeSenha,
} from "../../src/lib/trocarSenha.ts";

/* ------------------------------------------------------------ validação */

const dados = (troca = {}) => ({ email: "ana@empresa.com", atual: "SenhaAtual1", nova: "SenhaNova2", confirmar: "SenhaNova2", ...troca });

test("formulário completo passa na validação", () => {
  assert.equal(validarTrocaDeSenha(dados()), null);
});

test("cada campo faltando aponta para o campo certo", () => {
  assert.equal(validarTrocaDeSenha(dados({ email: null })).campo, "atual");
  assert.match(validarTrocaDeSenha(dados({ email: null })).mensagem, /e-mail/i);
  assert.equal(validarTrocaDeSenha(dados({ atual: "" })).campo, "atual");
  assert.match(validarTrocaDeSenha(dados({ atual: "" })).mensagem, /senha atual/i);
  assert.equal(validarTrocaDeSenha(dados({ nova: "" })).campo, "nova");
  assert.equal(validarTrocaDeSenha(dados({ confirmar: "" })).campo, "confirmar");
});

test("senha curta e senha gigante são recusadas com o limite no texto", () => {
  const curta = validarTrocaDeSenha(dados({ nova: "abc", confirmar: "abc" }));
  assert.equal(curta.campo, "nova");
  assert.match(curta.mensagem, new RegExp(`pelo menos ${TAMANHO_MINIMO} caracteres`));

  const gigante = validarTrocaDeSenha(dados({ nova: "a".repeat(TAMANHO_MAXIMO + 1), confirmar: "a".repeat(TAMANHO_MAXIMO + 1) }));
  assert.equal(gigante.campo, "nova");
  assert.match(gigante.mensagem, new RegExp(`${TAMANHO_MAXIMO}`));
});

test("repetir errado e senha igual à atual são recusados", () => {
  const diferente = validarTrocaDeSenha(dados({ confirmar: "OutraSenha3" }));
  assert.equal(diferente.campo, "confirmar");
  assert.match(diferente.mensagem, /não são iguais/i);

  const igual = validarTrocaDeSenha(dados({ nova: "SenhaAtual1", confirmar: "SenhaAtual1" }));
  assert.equal(igual.campo, "nova");
  assert.match(igual.mensagem, /diferente da atual/i);
});

/* ---------------------------------------------------------------- força */

test("força: curta não passa, comum é fraca e avisa", () => {
  const curta = classificarForca("abc");
  assert.equal(curta.nivel, "curta");
  assert.equal(curta.aceita, false);

  const comum = classificarForca("senha123");
  assert.equal(comum.nivel, "fraca");
  assert.equal(comum.aceita, false);
  assert.match(comum.dica, /comum/i);
});

test("força: só números não vira 'boa', e uma senha longa e misturada vira 'forte'", () => {
  assert.equal(classificarForca("123456789012").nivel, "fraca");
  const forte = classificarForca("Treina#Check2026!");
  assert.equal(forte.nivel, "forte");
  assert.equal(forte.aceita, true);
  assert.equal(forte.nivelVisual, 4);
});

test("força: níveis intermediários e a barra acompanham", () => {
  const media = classificarForca("agendinha12");
  assert.equal(media.nivel, "media");
  assert.equal(media.nivelVisual, 2);
  assert.equal(media.aceita, true);

  const boa = classificarForca("TreinaCheck26");
  assert.equal(boa.nivel, "boa");
  assert.ok(boa.nivelVisual > media.nivelVisual, "boa precisa aparecer maior que média na barra");
  assert.equal(classificarForca("").nivel, "curta");
});

test("o nome do produto (e outras senhas previsíveis) nunca aparece como forte", () => {
  for (const previsivel of ["treinacheck", "agendause", "usesistemas", "TreinaCheck", "AGENDAUSE"]) {
    const f = classificarForca(previsivel);
    assert.equal(f.nivel, "fraca", `"${previsivel}" não pode ser tratada como senha boa`);
    assert.equal(f.aceita, false);
  }
});

/* ----------------------------------------------------------- traduções */

test("erros de senha do Supabase viram frases úteis", () => {
  const casos = [
    ["Password is too weak. The password is easy to guess.", /vazamentos conhecidos/],
    ["Password should be at least 6 characters.", /curta demais/],
    ["Password is longer than 72 characters", /longa demais/],
    ["New password should be different from the old password.", /diferente da atual/],
    ["Too many requests", /Muitas tentativas/],
  ];
  for (const [bruto, esperado] of casos) {
    assert.match(explicarErroDeSenha(new Error(bruto)), esperado, `não tratou: ${bruto}`);
  }
});

test("erro de infraestrutura na troca de senha também é traduzido", () => {
  const erro = Object.assign(new Error("{}"), { name: "AuthRetryableFetchError", status: 503 });
  const texto = explicarErroDeSenha(erro);
  assert.match(texto, /fora do ar|instável/i);
  assert.ok(!texto.includes("{}"), "o {} nunca pode chegar na tela");
});

/* ------------------------------------------------------ a troca em si */

const clienteFalso = (erros = {}) => {
  const chamadas = [];
  return {
    chamadas,
    signInWithPassword: async (credenciais) => {
      chamadas.push({ tipo: "entrar", ...credenciais });
      return { error: erros.atual ?? null };
    },
    updateUser: async (atributos) => {
      chamadas.push({ tipo: "trocar", ...atributos });
      return { error: erros.nova ?? null };
    },
  };
};

test("caminho feliz: confirma a atual e grava a nova (com a atual junto)", async () => {
  const cliente = clienteFalso();
  const resultado = await trocarSenhaDeAcesso(cliente, dados());

  assert.equal(resultado.ok, true);
  assert.deepEqual(
    cliente.chamadas.map((c) => c.tipo),
    ["entrar", "trocar"],
    "primeiro confirma a senha atual, só depois troca",
  );
  assert.equal(cliente.chamadas[0].email, "ana@empresa.com");
  assert.equal(cliente.chamadas[0].password, "SenhaAtual1");
  assert.equal(cliente.chamadas[1].password, "SenhaNova2");
  assert.equal(cliente.chamadas[1].current_password, "SenhaAtual1", "o servidor precisa saber qual é a senha atual");
});

test("senha atual errada: NADA é gravado", async () => {
  const cliente = clienteFalso({
    atual: Object.assign(new Error("Invalid login credentials"), { status: 400, code: "invalid_credentials" }),
  });
  const resultado = await trocarSenhaDeAcesso(cliente, dados());

  assert.equal(resultado.ok, false);
  assert.equal(resultado.campo, "atual");
  assert.match(resultado.mensagem, /senha atual não confere/i);
  assert.match(resultado.mensagem, /Esqueci minha senha/, "aponta o caminho de quem não lembra a senha");
  assert.equal(cliente.chamadas.length, 1, "não pode chamar updateUser quando a senha atual não confere");
});

test("formulário inválido nem chega ao servidor", async () => {
  const cliente = clienteFalso();
  const resultado = await trocarSenhaDeAcesso(cliente, dados({ confirmar: "diferente" }));

  assert.equal(resultado.ok, false);
  assert.equal(resultado.campo, "confirmar");
  assert.equal(cliente.chamadas.length, 0, "validação é local: nenhuma chamada de rede");
});

test("falha ao gravar a nova senha devolve mensagem traduzida", async () => {
  const cliente = clienteFalso({ nova: new Error("Password is too weak. The password is easy to guess.") });
  const resultado = await trocarSenhaDeAcesso(cliente, dados());

  assert.equal(resultado.ok, false);
  assert.equal(resultado.campo, "nova");
  assert.match(resultado.mensagem, /vazamentos conhecidos/);
});

test("servidor fora do ar na confirmação avisa sem culpar a senha", async () => {
  const cliente = clienteFalso({
    atual: Object.assign(new Error("{}"), { name: "AuthRetryableFetchError", status: 500 }),
  });
  const resultado = await trocarSenhaDeAcesso(cliente, dados());

  assert.equal(resultado.ok, false);
  assert.equal(resultado.campo, "atual");
  assert.match(resultado.mensagem, /fora do ar|instável/i);
  assert.ok(!/não confere/i.test(resultado.mensagem), "servidor fora do ar não é 'senha errada'");
});

test("e-mail com espaços é normalizado antes de confirmar a senha", async () => {
  const cliente = clienteFalso();
  await trocarSenhaDeAcesso(cliente, dados({ email: "  ana@empresa.com  " }));
  assert.equal(cliente.chamadas[0].email, "ana@empresa.com");
});
