// node --test scripts/testes/agenda-semanal.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { getWeeklyAgendaDays } from "../../src/lib/weeklyAgenda.ts";

const monday = new Date(2026, 10, 16);
const weekdays = ["SEG", "TER", "QUA", "QUI", "SEX"];
const training = (id, day, hour = 9) => ({
  id,
  scheduled_at: new Date(2026, 10, day, hour).toISOString(),
});

test("mantém os cinco dias úteis, mesmo vazios, e ignora fins de semana de outras semanas", () => {
  const days = getWeeklyAgendaDays(monday, [training("anterior", 15), training("futuro", 28)]);
  assert.deepEqual(days.map(({ label }) => label), weekdays);
  assert.ok(days.every(({ events }) => events.length === 0));
});

test("mostra sábado sem reservar uma coluna para domingo", () => {
  const saturday = training("sábado", 21);
  const days = getWeeklyAgendaDays(monday, [saturday]);
  assert.deepEqual(days.map(({ label }) => label), [...weekdays, "SÁB"]);
  assert.deepEqual(days.at(-1).events, [saturday]);
});

test("mostra domingo depois de sexta quando sábado está vazio", () => {
  const sunday = training("domingo", 22, 23);
  const days = getWeeklyAgendaDays(monday, [sunday]);
  assert.deepEqual(days.map(({ label }) => label), [...weekdays, "DOM"]);
  assert.equal(days.at(-1).day.getDate(), 22);
  assert.deepEqual(days.at(-1).events, [sunday]);
});

test("mostra os dois dias quando há eventos em ambos e mantém a ordem dos horários", () => {
  const afternoon = training("tarde", 21, 15);
  const morning = training("manhã", 21);
  const sunday = training("domingo", 22);
  const days = getWeeklyAgendaDays(monday, [afternoon, sunday, morning]);
  assert.deepEqual(days.map(({ label }) => label), [...weekdays, "SÁB", "DOM"]);
  assert.deepEqual(days[5].events, [morning, afternoon]);
  assert.deepEqual(days[6].events, [sunday]);
});
