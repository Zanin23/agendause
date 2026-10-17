// node --experimental-strip-types --test scripts/testes/weekly-report.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { validReportRange, weeklyReportError } from '../../src/lib/weeklyReport.ts';

// Executa o handler real com apenas as fronteiras externas (Supabase/IA) simuladas.
const source = stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/weekly-report/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, ''));
const period = { start_date: '2026-10-01', end_date: '2026-10-11' };
function setup({ roles = [{ role: 'admin' }], validSession = true, apiKey = 'test-ai-key', aiStatus = 200, content = '# Relatório\nResumo do período.', queryError, timeout = false } = {}) {
  let handler;
  const calls = { ai: [], queries: [], clients: [] };
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_ANON_KEY: 'test-anon', LOVABLE_API_KEY: apiKey };
  const trainings = [
    { id: 't1', title: 'Visita', client: 'Cliente', status: 'realizado', scheduled_at: '2026-10-05T12:00:00Z' },
    { id: 't2', title: 'Cancelada', client: 'Cliente', status: 'cancelado', scheduled_at: '2026-10-06T12:00:00Z' },
  ];
  const createClient = (url, key, options) => {
    calls.clients.push({ key, options });
    return {
      auth: { getUser: async (token) => {
        assert.equal(token, 'test-session');
        return { data: { user: validSession ? { id: 'user-1' } : null }, error: null };
      } },
      from: (table) => {
        calls.queries.push({ table, key });
        let data = table === 'user_roles' ? roles : table === 'trainings' ? trainings : table === 'training_acceptances' ? [{ training_id: 't1' }, { training_id: 't2' }] : [];
        const query = {
          select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
          gte(column, value) { data = data.filter(row => row[column] >= value); return this; },
          lt(column, value) { data = data.filter(row => row[column] < value); return this; },
          then(resolve, reject) { return Promise.resolve({ data, error: queryError === table ? new Error('Database error') : null }).then(resolve, reject); },
        };
        return query;
      },
    };
  };
  runInNewContext(source, {
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    createClient, Response, AbortSignal, Error, console: { error() {} },
    fetch: async (url, options) => {
      calls.ai.push({ url, options });
      if (timeout) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      return new Response(JSON.stringify(aiStatus === 200 ? { choices: [{ message: { content } }] } : { error: 'private upstream details' }), { status: aiStatus });
    },
  });
  return {
    calls,
    request: async ({ body = period, token = 'test-session', method = 'POST' } = {}) => handler(new Request('https://example.invalid/weekly-report', {
      method, headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    })),
  };
}

test('gera relatório com Bearer de IA e consulta dados usando RLS do solicitante', async () => {
  const app = setup();
  const res = await app.request();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.report, /Relatório/);
  assert.equal(body.period_days, 11);
  assert.equal(body.stats.total_visits, 2);
  assert.equal(body.stats.confirmed_trainings, 1);
  assert.equal(body.stats.confirmation_rate_pct, 100);
  assert.equal(body.previousStats.total_visits, 0);
  assert.equal(app.calls.ai[0].options.headers.Authorization, 'Bearer test-ai-key');
  assert.ok(app.calls.ai[0].options.signal instanceof AbortSignal);
  assert.equal(app.calls.clients[1].options.global.headers.Authorization, 'Bearer test-session');
  assert.ok(app.calls.queries.filter(q => q.table !== 'user_roles').every(q => q.key === 'test-anon'));
});

test('preflight funciona sem sessão e método incorreto é recusado', async () => {
  const app = setup();
  const preflight = await app.request({ token: '', method: 'OPTIONS' });
  assert.equal(preflight.status, 200);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /authorization/);
  assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.equal((await app.request({ method: 'GET' })).status, 405);
  assert.equal(app.calls.clients.length, 0);
});

test('bloqueia sessão ausente ou inválida antes de acessar relatórios e IA', async () => {
  for (const options of [{ token: '' }, {}]) {
    const app = setup({ validSession: false });
    const res = await app.request(options);
    assert.equal(res.status, 401);
    assert.equal(app.calls.queries.length, 0);
    assert.equal(app.calls.ai.length, 0);
  }
});

test('exige admin ou reports/read; permissão de outra tela não basta', async () => {
  for (const roles of [[], [{ role: 'user' }], [{ role: 'user', screen_permissions: [{ screen: 'reports', actions: ['write'] }] }], [{ role: 'user', screen_permissions: [{ screen: 'clients', actions: ['read'] }] }]]) {
    const app = setup({ roles });
    assert.equal((await app.request()).status, 403);
    assert.equal(app.calls.ai.length, 0);
    assert.ok(app.calls.queries.every(q => q.table === 'user_roles'));
  }
  const app = setup({ roles: [{ role: 'user', screen_permissions: [{ screen: 'reports', actions: ['read'] }] }] });
  assert.equal((await app.request()).status, 200);
});

test('configuração de IA ausente tem mensagem acionável', async () => {
  const app = setup({ apiKey: '' });
  const res = await app.request();
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /LOVABLE_API_KEY/);
  assert.equal(app.calls.ai.length, 0);
});

test('datas vazias, inexistentes e invertidas não disparam consultas nem IA', async () => {
  for (const body of [null, [], { ...period, start_date: '' }, { ...period, end_date: '2026-02-30' }, { ...period, end_date: '2026-09-30' }, { start_date: period.start_date }, { week_start: 'invalid' }]) {
    const app = setup();
    assert.equal((await app.request({ body })).status, 400);
    assert.equal(app.calls.ai.length, 0);
    assert.ok(app.calls.queries.every(q => q.table === 'user_roles'));
  }
});

test('datas iguais representam um dia inclusive', async () => {
  const res = await setup().request({ body: { start_date: '2026-10-01', end_date: '2026-10-01' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).period_days, 1);
});

test('não gera métricas incompletas se uma consulta falha', async () => {
  for (const queryError of ['user_roles', 'trainings', 'training_acceptances', 'guest_acceptances']) {
    const app = setup({ queryError });
    assert.equal((await app.request()).status, 500);
    assert.equal(app.calls.ai.length, 0);
  }
});

test('erros de IA retornam mensagens úteis sem vazar resposta interna', async () => {
  for (const [aiStatus, status, message] of [[401, 503, /credencial/], [403, 503, /credencial/], [402, 402, /Créditos/], [429, 429, /Limite/], [500, 500, /indisponível/]]) {
    const res = await setup({ aiStatus }).request();
    assert.equal(res.status, status);
    const body = await res.json();
    assert.match(body.error, message);
    assert.ok(!JSON.stringify(body).includes('private upstream'));
  }
});

test('IA vazia e timeout são falhas, não sucesso sem relatório', async () => {
  for (const content of ['', '  ', null, []]) assert.equal((await setup({ content }).request()).status, 502);
  const res = await setup({ timeout: true }).request();
  assert.equal(res.status, 504);
  assert.match((await res.json()).error, /demorou/);
});

test('front-end extrai erro JSON de FunctionsHttpError sem consumir resposta original', async () => {
  const response = new Response(JSON.stringify({ error: 'Configure LOVABLE_API_KEY.' }), { status: 503 });
  assert.equal(await weeklyReportError({ context: response, message: 'Edge Function returned a non-2xx status code' }), 'Configure LOVABLE_API_KEY.');
  assert.equal(response.bodyUsed, false);
});

test('front-end explica sessão, permissões, publicação, rede, créditos e limites', async () => {
  for (const [status, text] of [[401, /sessão/], [403, /permissão/], [404, /não está publicada/], [402, /Créditos/], [429, /Limite/], [500, /indisponível/], [504, /demorou/]]) {
    assert.match(await weeklyReportError({ context: new Response('not JSON', { status }) }), text);
  }
  assert.match(await weeklyReportError({ name: 'FunctionsFetchError' }), /conexão/);
  assert.match(await weeklyReportError({ name: 'FunctionsRelayError' }), /publicada/);
});

test('front-end valida intervalo antes de formatar datas e chamar a função', () => {
  assert.ok(validReportRange('2026-10-01', '2026-10-11'));
  assert.ok(validReportRange('2026-10-01', '2026-10-01'));
  for (const [start, end] of [['', '2026-10-11'], ['2026-10-01', ''], ['2026-10-11', '2026-10-01'], ['2026-02-30', '2026-10-11']]) assert.equal(validReportRange(start, end), false);
});

test('gateway delega validação de JWT para o handler', () => {
  const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config, /\[functions.weekly-report\][^[]*verify_jwt\s*=\s*false/);
});
