#!/usr/bin/env node
// node --experimental-strip-types scripts/testes/admin-users.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAdminUsers, adminFunctionError, adminRpcError, callAdminAction, checkAdminPublication, SQL_LISTA, SQL_CONTAS, SQL_CORRECAO } from '../../src/lib/adminUsers.ts';

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

/* ---------- ações administrativas (criar conta, senha, permissões) ---------- */

const clienteAcao = ({ rpc, edge, reset } = {}) => {
  const chamadas = { rpc: [], edge: [], reset: [] };
  return {
    chamadas,
    rpc: async (name, args) => {
      chamadas.rpc.push({ name, args });
      if (!rpc) throw new Error('RPC não deveria ser chamada');
      return rpc({ name, args });
    },
    functions: {
      invoke: async (name, options) => {
        chamadas.edge.push({ name, body: options.body });
        if (!edge) throw new Error('Edge Function não deveria ser chamada');
        return edge({ name, body: options.body });
      },
    },
    auth: reset
      ? {
          resetPasswordForEmail: async (email, options) => {
            chamadas.reset.push({ email, options });
            return reset({ email, options });
          },
        }
      : undefined,
  };
};

const novoUsuario = {
  action: 'create_user',
  email: 'novo@empresa.com',
  password: 'SenhaNova1',
  full_name: 'Novo Usuário',
  role: 'member',
  screen_permissions: [{ screen: 'schedules', actions: ['read', 'write'] }],
  schedule_permissions: { '33333333-3333-3333-3333-333333333333': 'read' },
};

test('criar conta usa a RPC do banco, sem Edge Function', async () => {
  const c = clienteAcao({ rpc: () => ({ data: { success: true, user_id: 'u1' }, error: null }) });
  const r = await callAdminAction(c, novoUsuario);
  assert.deepEqual(r, { success: true, user_id: 'u1' });
  assert.equal(c.chamadas.rpc.length, 1);
  assert.equal(c.chamadas.rpc[0].name, 'admin_create_user');
  assert.deepEqual(c.chamadas.rpc[0].args, {
    _email: 'novo@empresa.com',
    _password: 'SenhaNova1',
    _full_name: 'Novo Usuário',
    _role: 'member',
    _screen_permissions: novoUsuario.screen_permissions,
    _schedule_permissions: novoUsuario.schedule_permissions,
  });
  assert.equal(c.chamadas.edge.length, 0, 'não deve chamar a Edge Function quando a RPC existe');
});

test('banco ainda sem a migração: cai na Edge Function com o mesmo pedido', async () => {
  for (const code of ['PGRST202', '42883']) {
    const c = clienteAcao({
      rpc: () => ({ data: null, error: { code, message: 'function not found' } }),
      edge: ({ body }) => ({ data: { success: true, via: 'edge', body }, error: null }),
    });
    const r = await callAdminAction(c, novoUsuario);
    assert.equal(r.via, 'edge');
    assert.deepEqual(r.body, novoUsuario);
    assert.equal(c.chamadas.edge[0].name, 'admin-users');
  }
});

test('erro de regra do banco não vira chamada à Edge Function', async () => {
  const c = clienteAcao({
    rpc: () => ({ data: null, error: { code: '23505', message: 'Já existe uma conta com o e-mail novo@empresa.com.' } }),
  });
  await assert.rejects(callAdminAction(c, novoUsuario), /Já existe uma conta/);
  assert.equal(c.chamadas.edge.length, 0);
});

test('senha, admin e permissões usam os argumentos certos', async () => {
  const chamadas = [];
  const c = clienteAcao({ rpc: ({ name, args }) => (chamadas.push({ name, args }), { data: { success: true }, error: null }) });
  await callAdminAction(c, { action: 'set_password', user_id: 'u2', password: 'Abc12345' });
  await callAdminAction(c, { action: 'set_admin', user_id: 'u2', admin: true });
  await callAdminAction(c, {
    action: 'set_permissions',
    user_id: 'u2',
    screen_permissions: [{ screen: 'reports', actions: ['read'] }],
    schedule_permissions: {},
  });
  assert.deepEqual(chamadas, [
    { name: 'admin_set_password', args: { _user_id: 'u2', _password: 'Abc12345' } },
    { name: 'admin_set_admin', args: { _user_id: 'u2', _admin: true } },
    {
      name: 'admin_set_permissions',
      args: {
        _user_id: 'u2',
        _screen_permissions: [{ screen: 'reports', actions: ['read'] }],
        _schedule_permissions: {},
      },
    },
  ]);
});

test('enviar redefinição usa o e-mail do próprio GoTrue, sem depender de deploy', async () => {
  const c = clienteAcao({ reset: () => ({ error: null }) });
  const r = await callAdminAction(c, {
    action: 'send_reset',
    email: 'quem@empresa.com',
    redirect_to: 'https://agendause.vercel.app/auth',
  });
  assert.deepEqual(r, { success: true });
  assert.deepEqual(c.chamadas.reset, [
    { email: 'quem@empresa.com', options: { redirectTo: 'https://agendause.vercel.app/auth' } },
  ]);
  assert.equal(c.chamadas.rpc.length, 0);
  assert.equal(c.chamadas.edge.length, 0);
});

test('enviar redefinição sem auth no cliente cai na Edge Function', async () => {
  const c = clienteAcao({ edge: () => ({ data: { success: true }, error: null }) });
  await callAdminAction(c, { action: 'send_reset', email: 'quem@empresa.com' });
  assert.equal(c.chamadas.edge[0].body.action, 'send_reset');
});

test('mensagens do banco ficam em português e explicam o que fazer', () => {
  assert.match(adminRpcError({ code: '42501', message: 'Acesso restrito a administradores.' }), /restrito a administradores/);
  assert.match(
    adminRpcError({ code: '42501', message: 'permission denied for table users' }),
    /publicar a Edge Function|service_role/,
  );
  assert.match(adminRpcError({ code: '42501', message: 'Este banco não autoriza gravar em auth.users a partir do SQL' }), /auth\.users/);
  assert.match(adminRpcError({ code: 'PGRST301', message: 'JWT expired' }), /sessão expirou/);
  assert.equal(adminRpcError({ code: '22023', message: 'Informe um e-mail válido.' }), 'Informe um e-mail válido.');
});

test('apagar conta usa a RPC admin_delete_user, sem Edge Function', async () => {
  const c = clienteAcao({ rpc: () => ({ data: { success: true, email: 'x@y.com' }, error: null }) });
  assert.deepEqual(await callAdminAction(c, { action: 'delete_user', user_id: 'u-antiga' }), { success: true, email: 'x@y.com' });
  assert.equal(c.chamadas.rpc[0].name, 'admin_delete_user');
  assert.deepEqual(c.chamadas.rpc[0].args, { _user_id: 'u-antiga' });
  assert.equal(c.chamadas.edge.length, 0);
});
test('apagar conta: recusa do banco (ex.: própria conta) vira mensagem, sem Edge Function', async () => {
  const c = clienteAcao({ rpc: () => ({ data: null, error: { code: '22023', message: 'Você não pode apagar a sua própria conta. Peça a outro administrador.' } }) });
  await assert.rejects(callAdminAction(c, { action: 'delete_user', user_id: 'eu' }), /própria conta/);
  assert.equal(c.chamadas.edge.length, 0);
});
test('apagar conta em banco sem a migração cai na Edge Function com delete_user', async () => {
  const c = clienteAcao({
    rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
    edge: () => ({ data: { success: true }, error: null }),
  });
  assert.deepEqual(await callAdminAction(c, { action: 'delete_user', user_id: 'u1' }), { success: true });
  assert.deepEqual(c.chamadas.edge[0], { name: 'admin-users', body: { action: 'delete_user', user_id: 'u1' } });
});

test('função ausente sem Edge Function publicada explica o caminho da migração', async () => {
  const c = clienteAcao({
    rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
    edge: () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } }),
  });
  await assert.rejects(callAdminAction(c, novoUsuario), /Conferir publicação no Supabase/);
  await assert.rejects(callAdminAction(c, novoUsuario), /admin-users/);
});

/* ---------- conferência de publicação (o que a tela mostra ao admin) ---------- */

const clientePublicacao = ({ rpcs = {}, funcao } = {}) => ({
  rpc: async (name) => (rpcs[name] ? rpcs[name] : { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }),
  functions: {
    invoke: async () => {
      if (funcao === 'lanca') throw new Error('Failed to send a request to the Edge Function');
      return funcao ?? { data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } };
    },
  },
});

const acha = (itens, chave) => itens.find((i) => i.chave === chave);

test('banco sem nada publicado: aponta os dois SQLs e a Edge Function', async () => {
  const itens = await checkAdminPublication(clientePublicacao({}));
  assert.equal(itens.length, 7);
  assert.equal(itens.filter((i) => i.nivel === 'faltando').length, 6, 'só as 6 funções do banco são exigidas');
  assert.equal(acha(itens, 'criar').arquivo, SQL_CONTAS);
  assert.equal(acha(itens, 'senha').arquivo, SQL_CONTAS);
  assert.equal(acha(itens, 'admin').arquivo, SQL_CONTAS);
  assert.equal(acha(itens, 'permissoes').arquivo, SQL_CONTAS);
  assert.equal(acha(itens, 'listar').arquivo, SQL_LISTA);
  assert.equal(acha(itens, 'excluir').arquivo, SQL_CORRECAO);
  assert.equal(acha(itens, 'excluir').nivel, 'faltando');
  assert.equal(acha(itens, 'funcao').nivel, 'opcional');
  assert.match(acha(itens, 'funcao').detalhe, /não faz falta/);
});

test('banco publicado: tudo ok, inclusive com a Edge Function ausente', async () => {
  const itens = await checkAdminPublication(
    clientePublicacao({
      rpcs: {
        // provas que recusam dentro da função = função publicada e funcionando
        admin_create_user: { data: null, error: { code: '22023', message: 'Informe um e-mail válido.' } },
        admin_set_password: { data: null, error: { code: '22023', message: 'A senha deve ter pelo menos 6 caracteres.' } },
        admin_set_admin: { data: null, error: { code: '22023', message: 'user_id é obrigatório' } },
        admin_set_permissions: { data: null, error: { code: '22023', message: 'user_id é obrigatório' } },
        admin_list_users: { data: { users: [], all_schedules: [] }, error: null },
        admin_delete_user: { data: null, error: { code: '22023', message: 'user_id é obrigatório' } },
      },
    }),
  );
  assert.equal(acha(itens, 'criar').nivel, 'ok');
  assert.match(acha(itens, 'criar').detalhe, /Informe um e-mail válido/);
  assert.equal(acha(itens, 'listar').nivel, 'ok');
  assert.equal(acha(itens, 'excluir').nivel, 'ok');
  assert.equal(acha(itens, 'funcao').nivel, 'opcional', 'a Edge Function não é exigida');
  assert.equal(itens.filter((i) => i.nivel === 'faltando').length, 0, 'nada pendente quando o banco está publicado');
  assert.equal(itens.filter((i) => i.nivel === 'erro').length, 0);
});

test('Edge Function publicada também é reconhecida', async () => {
  const itens = await checkAdminPublication(
    clientePublicacao({ rpcs: { admin_create_user: { data: null, error: { code: '22023', message: 'Informe um e-mail válido.' } } }, funcao: { data: { users: [] }, error: null } }),
  );
  assert.equal(acha(itens, 'funcao').nivel, 'ok');
});

test('sessão de quem não é admin não é confundida com "não publicado"', async () => {
  const itens = await checkAdminPublication(
    clientePublicacao({
      rpcs: {
        admin_create_user: { data: null, error: { code: '42501', message: 'Acesso restrito a administradores.' } },
        admin_set_password: { data: null, error: { code: '42501', message: 'Sua sessão expirou. Saia e entre novamente.' } },
      },
    }),
  );
  assert.equal(acha(itens, 'criar').nivel, 'erro');
  assert.equal(acha(itens, 'criar').arquivo, undefined);
  assert.match(acha(itens, 'senha').detalhe, /sessão expirou/i);
  assert.equal(acha(itens, 'listar').nivel, 'faltando', 'as outras continuam sendo conferidas');
});

test('erro de rede na Edge Function não derruba a conferência', async () => {
  const itens = await checkAdminPublication(
    clientePublicacao({ rpcs: { admin_list_users: { data: { users: [], all_schedules: [] }, error: null } }, funcao: 'lanca' }),
  );
  assert.equal(acha(itens, 'listar').nivel, 'ok');
  assert.equal(acha(itens, 'funcao').nivel, 'opcional');
});

test('a mensagem final de pendência ensina onde copiar o SQL', async () => {
  const c = clienteAcao({
    rpc: () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }),
    edge: () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } }),
  });
  await assert.rejects(callAdminAction(c, novoUsuario), /Conferir publicação no Supabase/);
  await assert.rejects(callAdminAction(c, novoUsuario), /admin-users/);
});
