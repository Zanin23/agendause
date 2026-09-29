import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return new Response(JSON.stringify({ error: 'Missing server configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---------------------------------------------------------------------
    // AUTENTICAÇÃO OBRIGATÓRIA
    // Antes desta função respondia a qualquer chamada anônima com os dados de
    // TODOS os workspaces (nomes de clientes, cancelamentos e motivos).
    // Agora exige uma sessão válida e restringe o relatório à base ativa de
    // quem chamou — o mesmo critério que o RLS já aplica no banco.
    // ---------------------------------------------------------------------
    const unauthorized = (msg: string, status: number) =>
      new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) return unauthorized('Não autenticado', 401);

    const { data: userData, error: userErr } = await createClient(SUPABASE_URL, ANON_KEY)
      .auth.getUser(token);
    if (userErr || !userData?.user) return unauthorized('Sessão inválida', 401);
    const caller = userData.user;

    const service = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: callerProfile } = await service
      .from('profiles')
      .select('active_workspace_id')
      .eq('id', caller.id)
      .maybeSingle();
    const workspaceId = (callerProfile as { active_workspace_id?: string | null } | null)
      ?.active_workspace_id;
    if (!workspaceId) {
      return unauthorized('Selecione uma base de trabalho antes de gerar o relatório', 400);
    }

    const body = await req.json().catch(() => ({}));
    const weekStartInput: string | undefined = body?.week_start;
    const startDateInput: string | undefined = body?.start_date;
    const endDateInput: string | undefined = body?.end_date;
    const weeksCountRaw = Number(body?.weeks ?? 1);
    const weeksCount = Math.max(1, Math.min(52, Number.isFinite(weeksCountRaw) ? Math.round(weeksCountRaw) : 1));

    // Determine period: prefer explicit start_date/end_date; fallback to week_start + weeks
    const now = new Date();
    let weekStart: Date;
    let weekEnd: Date;
    let useDateRange = false;
    if (startDateInput && endDateInput) {
      useDateRange = true;
      weekStart = new Date(startDateInput);
      weekStart.setHours(0, 0, 0, 0);
      weekEnd = new Date(endDateInput);
      // end date is inclusive → advance to next day 00:00 for the exclusive upper bound
      weekEnd.setHours(0, 0, 0, 0);
      weekEnd.setDate(weekEnd.getDate() + 1);
    } else {
      if (weekStartInput) {
        weekStart = new Date(weekStartInput);
      } else {
        const day = now.getDay();
        const diffToMonday = (day + 6) % 7;
        const thisMonday = new Date(now);
        thisMonday.setHours(0, 0, 0, 0);
        thisMonday.setDate(thisMonday.getDate() - diffToMonday);
        weekStart = new Date(thisMonday);
        weekStart.setDate(weekStart.getDate() - 7);
      }
      weekStart.setHours(0, 0, 0, 0);
      weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7 * weeksCount);
    }
    const periodDays = Math.max(1, Math.round((weekEnd.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000)));

    const supabase = service;

    const buildStats = async (start: Date, end: Date) => {
      // Escopo por workspace: sem este filtro a função somava as visitas de
      // todas as bases. As tabelas de aceite abaixo já ficam restritas porque
      // derivam dos `ids` retornados aqui.
      const { data: trainings, error: tErr } = await supabase
        .from('trainings')
        .select('id, title, client, description, scheduled_at, duration_minutes, location, status, cancellation_reason, cancelled_at')
        .eq('workspace_id', workspaceId)
        .gte('scheduled_at', start.toISOString())
        .lt('scheduled_at', end.toISOString())
        .order('scheduled_at', { ascending: true });
      if (tErr) throw tErr;

      const ids = (trainings || []).map((t: any) => t.id);
      let userAcc: any[] = [];
      let guestAcc: any[] = [];
      if (ids.length) {
        const [{ data: ua }, { data: ga }] = await Promise.all([
          supabase.from('training_acceptances').select('training_id, user_id, accepted_at').in('training_id', ids),
          supabase.from('guest_acceptances').select('training_id, full_name, email, accepted_at').in('training_id', ids),
        ]);
        userAcc = ua || [];
        guestAcc = ga || [];
      }

      const total = (trainings || []).length;
      const cancelled = (trainings || []).filter((t: any) => t.status === 'cancelado');
      const concluded = (trainings || []).filter((t: any) => t.status === 'concluido' || t.status === 'realizado');
      const scheduled = (trainings || []).filter((t: any) => t.status === 'agendado');

      const acceptsByTraining: Record<string, number> = {};
      [...userAcc, ...guestAcc].forEach((a) => {
        acceptsByTraining[a.training_id] = (acceptsByTraining[a.training_id] || 0) + 1;
      });
      const confirmedTrainings = (trainings || []).filter((t: any) => (acceptsByTraining[t.id] || 0) > 0).length;
      const nonCancelled = total - cancelled.length;
      const confirmationRate = nonCancelled > 0 ? Math.round((confirmedTrainings / nonCancelled) * 100) : 0;
      const totalAccepts = Object.values(acceptsByTraining).reduce((a, b) => a + b, 0);

      const clientCounts: Record<string, number> = {};
      (trainings || []).forEach((t: any) => {
        const c = (t.client || '').trim();
        if (c) clientCounts[c] = (clientCounts[c] || 0) + 1;
      });
      const topClients = Object.entries(clientCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      return {
        stats: {
          week_start: start.toISOString(),
          week_end: end.toISOString(),
          total_visits: total,
          cancelled_count: cancelled.length,
          concluded_count: concluded.length,
          scheduled_count: scheduled.length,
          confirmation_rate_pct: confirmationRate,
          confirmed_trainings: confirmedTrainings,
          total_acceptances: totalAccepts,
          top_clients: topClients,
          cancellations: cancelled.map((t: any) => ({
            title: t.title,
            client: t.client,
            reason: t.cancellation_reason,
            date: t.scheduled_at,
          })),
        },
        trainings: trainings || [],
        acceptsByTraining,
      };
    };

    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - periodDays);
    const prevEnd = new Date(weekStart);

    const [current, previous] = await Promise.all([
      buildStats(weekStart, weekEnd),
      buildStats(prevStart, prevEnd),
    ]);

    const stats = current.stats;
    const previousStats = previous.stats;

    const pctDelta = (curr: number, prev: number) => {
      if (prev === 0) return curr === 0 ? 0 : 100;
      return Math.round(((curr - prev) / prev) * 100);
    };
    const comparison = {
      total_visits: { curr: stats.total_visits, prev: previousStats.total_visits, delta_pct: pctDelta(stats.total_visits, previousStats.total_visits) },
      cancelled_count: { curr: stats.cancelled_count, prev: previousStats.cancelled_count, delta_pct: pctDelta(stats.cancelled_count, previousStats.cancelled_count) },
      confirmed_trainings: { curr: stats.confirmed_trainings, prev: previousStats.confirmed_trainings, delta_pct: pctDelta(stats.confirmed_trainings, previousStats.confirmed_trainings) },
      total_acceptances: { curr: stats.total_acceptances, prev: previousStats.total_acceptances, delta_pct: pctDelta(stats.total_acceptances, previousStats.total_acceptances) },
      confirmation_rate_pct: { curr: stats.confirmation_rate_pct, prev: previousStats.confirmation_rate_pct, delta_pct: stats.confirmation_rate_pct - previousStats.confirmation_rate_pct },
    };

    const trainingsLines = current.trainings.map((t: any) => {
      const accepts = current.acceptsByTraining[t.id] || 0;
      return `- ${new Date(t.scheduled_at).toISOString().slice(0, 16).replace('T', ' ')} | ${t.title}${t.client ? ` (cliente: ${t.client})` : ''} | status: ${t.status} | aceites: ${accepts}${t.cancellation_reason ? ` | motivo cancel.: ${t.cancellation_reason}` : ''}`;
    }).join('\n');

    const periodLabel = useDateRange
      ? `o período de ${periodDays} dia${periodDays === 1 ? '' : 's'}`
      : (weeksCount === 1 ? 'a semana' : `o período de ${weeksCount} semanas`);
    const prevLabel = useDateRange
      ? `os ${periodDays} dia${periodDays === 1 ? '' : 's'} anteriores`
      : (weeksCount === 1 ? 'semana anterior' : `${weeksCount} semanas anteriores`);
    const prompt = `Você é analista de operações. Gere um relatório executivo em português (markdown) sobre ${periodLabel} de visitas/treinamentos a seguir. Seja conciso, use bullets, e inclua:
1) Resumo do período (números-chave)
2) Cancelamentos (quantidade, motivos recorrentes)
3) Taxa de confirmação dos clientes e leitura dela
4) Clientes mais atendidos
5) **Comparativo com ${prevLabel}** — destaque variações relevantes (visitas, cancelamentos, aceites, taxa de confirmação) e interprete o que mudou
6) Observações e recomendações práticas para o próximo período

Dados agregados (JSON):
${JSON.stringify(stats, null, 2)}

Semana anterior (JSON, para comparação):
${JSON.stringify(previousStats, null, 2)}

Comparativo já calculado (use estes valores no item 5):
${JSON.stringify(comparison, null, 2)}

Lista de visitas:
${trainingsLines || '(nenhuma visita na semana)'}
`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Lovable-API-Key': LOVABLE_API_KEY,
        'X-Lovable-AIG-SDK': 'vercel-ai-sdk',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: 'Você gera relatórios executivos claros, objetivos e em português do Brasil. Use markdown.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em instantes.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos de IA esgotados. Adicione créditos no workspace para continuar.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Falha ao gerar relatório com IA', detail: text }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiRes.json();
    const report = aiJson?.choices?.[0]?.message?.content ?? '';

    return new Response(JSON.stringify({ stats, previousStats, comparison, report, weeks: weeksCount, period_days: periodDays, workspace_id: workspaceId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});