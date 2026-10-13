#!/usr/bin/env node
// node --experimental-strip-types scripts/testes/admin-users.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAdminUsers, adminFunctionError } from '../../src/lib/adminUsers.ts';

const payload = { users: [{ id: 'me' }, { id: 'another' }], all_schedules: [] };
const client = (result, legacy) => ({
  rpc: async (name) => { assert.equal(name, 'admin_list_users'); return result; },
  functions: { invoke: async (name, options) => {
    assert.equal(name, 'admin-users');
    assert.deepEqual(options.body, { action: 'list' });
    assert.ok(legacy, 'Não deveria chamar a Edge Function');
    return legacy;
  } },
});

test('lista inclui a própria conta e não chama Edge Function', async () => {
  assert.deepEqual(await loadAdminUsers(client({ data: payload, error: null })), payload);
});
test('lista vazia é válida somente se o servidor retornou arrays', async () => {
  const empty = { users: [], all_schedules: [] };
  assert.deepEqual(await loadAdminUsers(client({ data: empty, error: null })), empty);
  for (const data of [null, {}, { users: [] }, { users: 'inválido', all_schedules: [] }]) {
    await assert.rejects(loadAdminUsers(client({ data, error: null })), /lista de usuários inválida/);
  }
});
test('compatibilidade com banco que ainda não tem a migração', async () => {
  for (const code of ['PGRST202', '42883']) {
    assert.deepEqual(await loadAdminUsers(client(
      { data: null, error: { code, message: 'not found' } },
      { data: payload, error: null },
    )), payload);
  }
});
test('não usa fallback em erro de permissão ou rede', async () => {
  for (const code of ['42501', 'PGRST301', undefined]) {
    await assert.rejects(loadAdminUsers(client({ data: null, error: { code, message: 'falhou' } })));
  }
});
test('função e migração ausentes geram orientação, não lista vazia', async () => {
  await assert.rejects(loadAdminUsers(client(
    { data: null, error: { code: 'PGRST202', message: 'not found' } },
    { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } },
  )), /migração admin_list_users.*função admin-users/);
});
test('mensagens úteis para transporte, sessão e função ausente', async () => {
  assert.match(await adminFunctionError({ name: 'FunctionsFetchError', message: 'fetch failed' }), /Verifique a conexão/);
  assert.match(await adminFunctionError({ message: 'HTTP', context: new Response(null, { status: 401 }) }), /sessão expirou/);
  assert.match(await adminFunctionError({ message: 'HTTP', context: new Response(null, { status: 404 }) }), /não está publicada/);
  assert.equal(await adminFunctionError({ message: 'HTTP', context: new Response('{"error":"Senha fraca"}', { status: 400 }) }), 'Senha fraca');
});
