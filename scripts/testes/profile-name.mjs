#!/usr/bin/env node
// node --experimental-strip-types scripts/testes/profile-name.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeProfileName, firstNameOf, greetingForHour } from '../../src/lib/profileName.ts';

test('normaliza espaços sem alterar acentos ou o nome completo', () => {
  assert.equal(normalizeProfileName('  João   da Silva  '), 'João da Silva');
  assert.equal(normalizeProfileName('Ana\tMaria\nSouza'), 'Ana Maria Souza');
  assert.equal(normalizeProfileName('Érica'), 'Érica');
});
test('rejeita nomes vazios, muito curtos e muito longos', () => {
  for (const name of ['', ' ', '\t\n', 'a', 'a'.repeat(81)]) assert.throws(() => normalizeProfileName(name));
  assert.equal(normalizeProfileName('a'.repeat(80)).length, 80);
});
test('a saudação usa apenas o primeiro nome', () => {
  assert.equal(firstNameOf('  João da Silva '), 'João');
  assert.equal(firstNameOf('Ana\tSouza'), 'Ana');
  for (const name of [null, undefined, '', '  ', 12, {}]) assert.equal(firstNameOf(name), '');
});
test('preserva as maiúsculas e minúsculas do nome cadastrado na saudação', () => {
  for (const name of ['João', 'joão', 'JOÃO', 'McKenzie', 'Érica']) {
    assert.equal(firstNameOf(normalizeProfileName(`  ${name} da Silva  `)), name);
  }
});
test('bom dia, boa tarde e boa noite respeitam os horários de transição', () => {
  for (const [hour, greeting] of [[0, 'Bom dia'], [11, 'Bom dia'], [12, 'Boa tarde'], [17, 'Boa tarde'], [18, 'Boa noite'], [23, 'Boa noite']]) {
    assert.equal(greetingForHour(hour), greeting);
  }
});
