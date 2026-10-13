#!/usr/bin/env node
/* ============================================================================
   Testes de src/lib/projetoAtual.ts — qual banco o site usa.

   O caso que originou isto: instruções antigas deste repositório mandavam
   publicar tudo em `psgekwifthuzduhpreay`, um projeto que o sistema nunca usou.
   O projeto oficial — onde estão as contas, os dados e o que está na Vercel — é
   o **Agendause** (`pnaupodddxrbqbjilhft`). Um build apontado para o projeto
   errado derruba o login com erro 500 mesmo com o oficial saudável.

   O que é conferido:
     1. os valores oficiais batem com o .env do repositório (pega desatualização);
     2. build apontando para projeto aposentado → o app corrige (quando conhece a
        chave pública) ou avisa, sem trocar chave errada no lugar certo;
     3. qualquer outro projeto (ou local) → respeitado, sem mexer;
     4. o aviso diz onde corrigir (Vercel + nomes das variáveis).

   Como rodar:
     node --experimental-strip-types scripts/testes/projeto-supabase.mjs
   ============================================================================ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  CHAVE_PUBLICA,
  PROJETO_ATUAL,
  PROJETOS_APOSENTADOS,
  avisoDeProjetoAntigo,
  ehProjetoAposentado,
  painelDoProjeto,
  refDoProjeto,
  resolverProjeto,
} from "../../src/lib/projetoAtual.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const lerEnv = () => {
  const out = {};
  for (const linha of readFileSync(resolve(RAIZ, ".env"), "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/i);
    if (m) out[m[1]] = m[2];
  }
  return out;
};

const env = lerEnv();
const chaveConhecida = !!CHAVE_PUBLICA.trim();

test("o projeto oficial é o Agendause (pnaupodddxrbqbjilhft)", () => {
  assert.equal(PROJETO_ATUAL.ref, "pnaupodddxrbqbjilhft");
  assert.equal(PROJETO_ATUAL.url, "https://pnaupodddxrbqbjilhft.supabase.co");
  assert.equal(PROJETO_ATUAL.nome, "Agendause");
  assert.equal(ehProjetoAposentado(PROJETO_ATUAL.ref), false, "o projeto oficial não pode estar na lista de aposentados");
});

test("os valores oficiais são os mesmos do .env do repositório", () => {
  assert.equal(env.VITE_SUPABASE_PROJECT_ID, PROJETO_ATUAL.ref, "o .env precisa apontar para o projeto oficial");
  assert.equal(env.VITE_SUPABASE_URL, PROJETO_ATUAL.url, "o .env precisa apontar para o projeto oficial");
  if (chaveConhecida) {
    assert.equal(env.VITE_SUPABASE_PUBLISHABLE_KEY, CHAVE_PUBLICA, "a chave do .env e a do código precisam ser a mesma");
  }
});

test("a chave pública do projeto oficial está preenchida", (t) => {
  if (!chaveConhecida) {
    t.diagnostic("PENDENTE: cole em CHAVE_PUBLICA (src/lib/projetoAtual.ts) a chave pública do Agendause — e a mesma no .env");
    // Sem a chave o app não quebra: só deixa de corrigir o build sozinho.
    const p = resolverProjeto("https://psgekwifthuzduhpreay.supabase.co", "chave-do-projeto-errado", "psgekwifthuzduhpreay");
    assert.equal(p.situacao, "aviso", "sem chave pública, a correção automática fica desligada (só aviso)");
    return;
  }
  assert.ok(
    CHAVE_PUBLICA.startsWith("sb_publishable_") || CHAVE_PUBLICA.startsWith("eyJ"),
    "a chave pública costuma começar com sb_publishable_ (nova) ou eyJ (anon antiga)",
  );
});

test("o projeto dos enganos de 11/10 é reconhecido como aposentado", () => {
  assert.deepEqual([...PROJETOS_APOSENTADOS], ["psgekwifthuzduhpreay"]);
  for (const antigo of PROJETOS_APOSENTADOS) {
    assert.equal(ehProjetoAposentado(antigo), true);
    assert.equal(ehProjetoAposentado(antigo.toUpperCase()), true);
  }
  assert.equal(ehProjetoAposentado(null), false);
  assert.equal(ehProjetoAposentado(undefined), false);
});

test("refDoProjeto entende os endereços do Supabase", () => {
  assert.equal(refDoProjeto("https://pnaupodddxrbqbjilhft.supabase.co"), "pnaupodddxrbqbjilhft");
  assert.equal(refDoProjeto("https://pnaupodddxrbqbjilhft.supabase.co/"), "pnaupodddxrbqbjilhft");
  assert.equal(refDoProjeto("HTTPS://PNAUPODDDXRBQBJILHFT.SUPABASE.CO"), "pnaupodddxrbqbjilhft");
  assert.equal(refDoProjeto("https://exemplo.com"), null);
  assert.equal(refDoProjeto(""), null);
  assert.equal(refDoProjeto(null), null);
});

test("build apontando para o projeto errado → corrige (com chave) ou avisa (sem chave)", () => {
  const p = resolverProjeto("https://psgekwifthuzduhpreay.supabase.co", "chave-do-projeto-errado", "psgekwifthuzduhpreay");
  assert.equal(p.refDeclarada, "psgekwifthuzduhpreay");
  assert.equal(p.refOficial, PROJETO_ATUAL.ref);
  if (chaveConhecida) {
    assert.equal(p.situacao, "trocado");
    assert.equal(p.url, PROJETO_ATUAL.url);
    assert.equal(p.chave, CHAVE_PUBLICA, "não pode misturar a chave do projeto errado com o projeto certo");
    assert.equal(p.ref, PROJETO_ATUAL.ref);
  } else {
    assert.equal(p.situacao, "aviso");
    assert.equal(p.url, "https://psgekwifthuzduhpreay.supabase.co", "sem a chave oficial, não dá para trocar sem quebrar");
  }
});

test("só a URL errada (sem o id do projeto) também é detectada", () => {
  const p = resolverProjeto("https://psgekwifthuzduhpreay.supabase.co", "chave-qualquer");
  assert.equal(p.refDeclarada, "psgekwifthuzduhpreay");
  assert.notEqual(p.situacao, "ok");
});

test("build sem variáveis cai no projeto oficial quando a chave é conhecida", () => {
  const p = resolverProjeto("", "");
  assert.equal(p.refDeclarada, null);
  if (chaveConhecida) {
    assert.equal(p.situacao, "trocado");
    assert.equal(p.url, PROJETO_ATUAL.url);
    assert.equal(p.chave, CHAVE_PUBLICA);
  } else {
    assert.equal(p.situacao, "aviso");
  }
});

test("projeto oficial configurado: nada é trocado", () => {
  const p = resolverProjeto(PROJETO_ATUAL.url, "chave-do-projeto-oficial", PROJETO_ATUAL.ref);
  assert.equal(p.situacao, "ok");
  assert.equal(p.url, PROJETO_ATUAL.url);
  assert.equal(p.chave, "chave-do-projeto-oficial");
  assert.equal(p.ref, PROJETO_ATUAL.ref);
  assert.equal(p.refDeclarada, PROJETO_ATUAL.ref);
});

test("outro projeto qualquer (homologação, local) é respeitado", () => {
  const homolog = resolverProjeto("https://homologacao-teste.supabase.co", "outra-chave", "homologacao-teste");
  assert.equal(homolog.situacao, "ok");
  assert.equal(homolog.url, "https://homologacao-teste.supabase.co");
  assert.equal(homolog.chave, "outra-chave");

  const local = resolverProjeto("http://127.0.0.1:54321", "chave-local");
  assert.equal(local.situacao, "ok", "banco local (supabase start) não pode ser trocado pelo oficial");
  assert.equal(local.url, "http://127.0.0.1:54321");
});

test("URL com barra no fim é normalizada", () => {
  assert.equal(resolverProjeto(`${PROJETO_ATUAL.url}/`, "k", null).url, PROJETO_ATUAL.url);
});

test("o aviso diz o projeto errado, o oficial, a Vercel e os nomes das variáveis", () => {
  const aviso = avisoDeProjetoAntigo(
    resolverProjeto("https://psgekwifthuzduhpreay.supabase.co", "x", "psgekwifthuzduhpreay"),
  );
  assert.ok(aviso, "precisa haver aviso quando a configuração está errada");
  assert.match(aviso, /psgekwifthuzduhpreay/);
  assert.match(aviso, /pnaupodddxrbqbjilhft/);
  assert.match(aviso, /Agendause/);
  assert.match(aviso, /Vercel/);
  assert.match(aviso, /VITE_SUPABASE_URL/);
  assert.match(aviso, /VITE_SUPABASE_PROJECT_ID/);
  assert.match(aviso, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(aviso, /deploy/);
});

test("configuração certa não gera aviso", () => {
  assert.equal(avisoDeProjetoAntigo(resolverProjeto(PROJETO_ATUAL.url, "k", PROJETO_ATUAL.ref)), null);
});

test("painelDoProjeto monta o endereço do painel", () => {
  assert.equal(painelDoProjeto("pnaupodddxrbqbjilhft"), "https://supabase.com/dashboard/project/pnaupodddxrbqbjilhft");
  assert.equal(painelDoProjeto(null), "https://supabase.com/dashboard");
});
