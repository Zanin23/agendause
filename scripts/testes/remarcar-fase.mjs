#!/usr/bin/env node
/* ============================================================================
   Testes das regras novas do cronograma:

     · remarcar um módulo (fase) inteiro  → planejarRemarcacao / diaISO /
       descreveDeslocamento;
     · status do cronograma dentro dele    → payloadStatus, rótulos, variantes e
       opções do menu.

   São funções puras (sem banco, sem tela), então dá para conferir cada regra:
   distância entre etapas preservada, fim de semana → segunda, concluídas fora
   por padrão, pausa encerrada ao trocar de status.

   Como rodar:
     node --experimental-strip-types scripts/testes/remarcar-fase.mjs
   ============================================================================ */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SCHEDULE_STATUS_LABELS,
  SCHEDULE_STATUS_OPTIONS,
  SCHEDULE_STATUS_VARIANTS,
  descreveDeslocamento,
  diaISO,
  isPausedStatus,
  payloadStatus,
  planejarRemarcacao,
  scheduleStatusLabel,
  scheduleStatusVariant,
} from "../../src/lib/schedule.ts";

const itens = [
  { id: "a", planned_date: "2026-10-12", status: "pending" }, // segunda
  { id: "b", planned_date: "2026-10-14", status: "in_progress" }, // quarta
  { id: "c", planned_date: "2026-10-20", status: "done" }, // terça (já feita)
  { id: "d", planned_date: null, status: "pending" }, // sem data
];

/* ---------- remarcar o módulo (fase) inteiro ---------- */

test("nova data de início move a fase e preserva a distância entre as etapas", () => {
  const plano = planejarRemarcacao(itens, { modo: "inicio", valor: "2026-10-19" });
  assert.equal(plano.deslocamento, 7);
  assert.deepEqual(plano.alteracoes, [
    { id: "a", de: "2026-10-12", para: "2026-10-19" },
    { id: "b", de: "2026-10-14", para: "2026-10-21" },
  ]);
  assert.equal(plano.ignorados, 2, "a concluída e a sem data ficam de fora");
  assert.deepEqual(plano.janelaAtual, { inicio: "2026-10-12", fim: "2026-10-14" });
  assert.deepEqual(plano.janelaNova, { inicio: "2026-10-19", fim: "2026-10-21" });
});

test("com incluirConcluidos a etapa feita também anda", () => {
  const plano = planejarRemarcacao(itens, { modo: "inicio", valor: "2026-10-19", incluirConcluidos: true });
  assert.deepEqual(
    plano.alteracoes.map((a) => a.id),
    ["a", "b", "c"],
  );
  assert.equal(plano.alteracoes[2].para, "2026-10-27");
  assert.equal(plano.ignorados, 1, "só a sem data fica fora");
  assert.deepEqual(plano.janelaAtual, { inicio: "2026-10-12", fim: "2026-10-20" });
});

test("adiar/antecipar em dias, com fim de semana indo para segunda", () => {
  const sabado = [
    { id: "s", planned_date: "2026-10-17", status: "pending" }, // sábado
    { id: "q", planned_date: "2026-10-13", status: "pending" }, // terça
  ];
  const plano = planejarRemarcacao(sabado, { modo: "deslocamento", valor: 1 });
  assert.deepEqual(plano.alteracoes, [
    { id: "s", de: "2026-10-17", para: "2026-10-19" }, // sáb+1 = dom → segunda
    { id: "q", de: "2026-10-13", para: "2026-10-14" },
  ]);
  assert.equal(plano.deslocamento, 1);
});

test("sem ajuste de dia útil a data cai no fim de semana mesmo", () => {
  const sabado = [{ id: "s", planned_date: "2026-10-17", status: "pending" }];
  const plano = planejarRemarcacao(sabado, { modo: "deslocamento", valor: 1, ajustarDiaUtil: false });
  assert.equal(plano.alteracoes[0].para, "2026-10-18"); // domingo
});

test("antecipar usa número negativo", () => {
  const plano = planejarRemarcacao(itens, { modo: "deslocamento", valor: -7 });
  assert.equal(plano.deslocamento, -7);
  assert.deepEqual(plano.alteracoes, [
    { id: "a", de: "2026-10-12", para: "2026-10-05" },
    { id: "b", de: "2026-10-14", para: "2026-10-07" },
  ]);
  assert.equal(descreveDeslocamento(plano.deslocamento), "antecipadas 7 dia(s)");
});

test("mover zero dias não altera nada", () => {
  const plano = planejarRemarcacao(itens, { modo: "deslocamento", valor: 0 });
  assert.equal(plano.deslocamento, 0);
  assert.deepEqual(plano.alteracoes, []);
  assert.equal(descreveDeslocamento(0), "sem mudança de prazo");
});

test("data de início inválida (ou vazia) não inventa deslocamento", () => {
  for (const valor of ["", "12/10/2026", "2026-13-40"]) {
    const plano = planejarRemarcacao(itens, { modo: "inicio", valor });
    assert.equal(plano.deslocamento, 0);
    assert.deepEqual(plano.alteracoes, []);
    assert.deepEqual(plano.janelaAtual, { inicio: "2026-10-12", fim: "2026-10-14" });
  }
});

test("fase sem etapas (ou só com concluídas) não gera plano", () => {
  assert.deepEqual(planejarRemarcacao([], { modo: "deslocamento", valor: 7 }).janelaAtual, null);
  const soFeitas = [{ id: "x", planned_date: "2026-10-12", status: "done" }];
  const plano = planejarRemarcacao(soFeitas, { modo: "deslocamento", valor: 7 });
  assert.deepEqual(plano.alteracoes, []);
  assert.equal(plano.janelaAtual, null);
  assert.equal(plano.ignorados, 1);
});

test("etapa 'não aplicável' fica fora por padrão e entra com incluirConcluidos", () => {
  const comNaoAplicavel = [
    { id: "n", planned_date: "2026-10-12", status: "not_applicable" },
    { id: "p", planned_date: "2026-10-13", status: "pending" },
  ];
  assert.deepEqual(
    planejarRemarcacao(comNaoAplicavel, { modo: "deslocamento", valor: 1 }).alteracoes.map((a) => a.id),
    ["p"],
  );
  assert.deepEqual(
    planejarRemarcacao(comNaoAplicavel, { modo: "deslocamento", valor: 1, incluirConcluidos: true }).alteracoes.map((a) => a.id),
    ["n", "p"],
  );
});

test("diaISO aceita yyyy-mm-dd (com hora) e recusa o resto", () => {
  assert.equal(diaISO("2026-10-12"), "2026-10-12");
  assert.equal(diaISO("2026-10-12T00:00:00"), "2026-10-12");
  assert.equal(diaISO(""), null);
  assert.equal(diaISO(null), null);
  assert.equal(diaISO("12/10/2026"), null);
});

/* ---------- status do cronograma ---------- */

test("sair da pausa limpa paused_at e pause_reason", () => {
  assert.deepEqual(payloadStatus("active", "paused"), { status: "active", paused_at: null, pause_reason: null });
  assert.deepEqual(payloadStatus("completed", "waiting_client"), {
    status: "completed",
    paused_at: null,
    pause_reason: null,
  });
});

test("trocar entre status comuns não mexe na pausa", () => {
  assert.deepEqual(payloadStatus("completed", "active"), { status: "completed" });
  assert.deepEqual(payloadStatus("archived", "draft"), { status: "archived" });
});

test("todo status usado pelo app tem rótulo e variante de badge", () => {
  for (const s of ["draft", "active", "in_progress", "accepted", "completed", "archived", "paused", "waiting_client"]) {
    assert.ok(SCHEDULE_STATUS_LABELS[s], `rótulo faltando para ${s}`);
    assert.ok(SCHEDULE_STATUS_VARIANTS[s], `variante faltando para ${s}`);
    assert.equal(scheduleStatusLabel(s), SCHEDULE_STATUS_LABELS[s]);
    assert.equal(scheduleStatusVariant(s), SCHEDULE_STATUS_VARIANTS[s]);
  }
  assert.equal(scheduleStatusLabel("qualquer-coisa"), "qualquer-coisa", "status desconhecido mostra o valor cru, não vazio");
  assert.equal(scheduleStatusLabel(null), "—");
});

test("o menu do editor tem os 5 status do dia a dia e não repete a pausa", () => {
  assert.deepEqual(
    SCHEDULE_STATUS_OPTIONS.map((o) => o.value),
    ["draft", "active", "in_progress", "completed", "archived"],
  );
  for (const op of SCHEDULE_STATUS_OPTIONS) {
    assert.ok(op.label && op.hint, `opção ${op.value} precisa de rótulo e dica`);
    assert.ok(!isPausedStatus(op.value), "pausa tem controle próprio, não entra no menu");
  }
  assert.ok(SCHEDULE_STATUS_OPTIONS.some((o) => o.value === "completed"));
});

test("isPausedStatus reconhece só as duas pausas", () => {
  assert.equal(isPausedStatus("paused"), true);
  assert.equal(isPausedStatus("waiting_client"), true);
  assert.equal(isPausedStatus("active"), false);
  assert.equal(isPausedStatus(null), false);
});
