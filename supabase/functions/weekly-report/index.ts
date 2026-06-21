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
    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Missing server configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const weekStartInput: string | undefined = body?.week_start;

    // Compute Monday 00:00 of the requested week (default: last full week ending yesterday)
    const now = new Date();
    let weekStart: Date;
    if (weekStartInput) {
      weekStart = new Date(weekStartInput);
    } else {
      // last week's Monday
      const day = now.getDay(); // 0=Sun..6=Sat
      const diffToMonday = (day + 6) % 7; // days since Monday
      const thisMonday = new Date(now);
      thisMonday.setHours(0, 0, 0, 0);
      thisMonday.setDate(thisMonday.getDate() - diffToMonday);
      weekStart = new Date(thisMonday);
      weekStart.setDate(weekStart.getDate() - 7);
    }
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const buildStats = async (start: Date, end: Date) => {
      const { data: trainings, error: tErr } = await supabase
        .from('trainings')
        .select('id, title, client, description, scheduled_at, duration_minutes, location, status, cancellation_reason, cancelled_at')
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
    prevStart.setDate(prevStart.getDate() - 7);
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

    const prompt = `Você é analista de operações. Gere um relatório executivo em português (markdown) sobre a semana de visitas/treinamentos a seguir. Seja conciso, use bullets, e inclua:
1) Resumo da semana (números-chave)
2) Cancelamentos (quantidade, motivos recorrentes)
3) Taxa de confirmação dos clientes e leitura dela
4) Clientes mais atendidos
5) **Comparativo com a semana anterior** — destaque variações relevantes (visitas, cancelamentos, aceites, taxa de confirmação) e interprete o que mudou
6) Observações e recomendações práticas para a próxima semana

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

    return new Response(JSON.stringify({ stats, previousStats, comparison, report }), {
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