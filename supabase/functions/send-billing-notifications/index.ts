// deno-lint-ignore-file no-explicit-any
// Edge function: send push notifications for pending billing requests
// Triggered by pg_cron each minute. Walks user notification settings and
// fires Web Push to each subscribed device when the current time matches.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLIC =
  "BLypB4mj8qUUp6Dp-4vBMOMEZuzEYiEMap_k7_Zzbj5ZVqkqK3h5bqiTLbYcXzbNoP8sx_YcNowGBg-ozUlIao0";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@usesistemas.com.br";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

function nowInTz(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hhmm: `${get("hour")}:${get("minute")}`, weekday: wdMap[get("weekday")] ?? 0 };
}

function currentWeekStart(tz = "America/Sao_Paulo") {
  // Returns Monday of the current week (YYYY-MM-DD) in the given timezone.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wd = wdMap[get("weekday")] ?? 1;
  const diff = (wd + 6) % 7; // days since Monday
  const d = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

// Comparação em tempo constante: evitar que o segredo vaze medindo o tempo de
// resposta caractere a caractere.
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const reject = (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // ---------------------------------------------------------------------
  // AUTENTICAÇÃO OBRIGATÓRIA
  // Esta função é invocada pelo pg_cron a cada minuto, e o pg_cron não envia
  // JWT. Por isso ela NÃO pode usar verify_jwt = true (quebraria o agendador).
  // A proteção passa a ser um segredo compartilhado no header X-Cron-Secret.
  //
  // Sem isto, qualquer pessoa na internet podia chamar { "force": true } e
  // disparar Web Push para TODOS os usuários inscritos, sem limite de
  // frequência.
  //
  // Dois chamadores são aceitos:
  //   · pg_cron   → header X-Cron-Secret confere com CRON_SECRET
  //   · o próprio usuário logado (botão "enviar notificação de teste") → JWT
  //     válido, e nesse caso o disparo é restrito ao user_id dele
  // ---------------------------------------------------------------------
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (!CRON_SECRET) return reject("Missing server configuration", 500);

  const isCron = safeEqual(req.headers.get("X-Cron-Secret") ?? "", CRON_SECRET);

  let callerId: string | null = null;
  if (!isCron) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return reject("Não autorizado", 401);
    const { data: userData, error: userErr } = await createClient(SUPABASE_URL, ANON_KEY)
      .auth.getUser(token);
    if (userErr || !userData?.user) return reject("Sessão inválida", 401);
    callerId = userData.user.id;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { hhmm, weekday } = nowInTz();
  const weekStart = currentWeekStart();

  // Body may override (for manual test): { force: true, user_id?: string }
  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {}

  // `force` sem `user_id` disparava para a base inteira. Agora exige alvo
  // explícito, e um usuário autenticado só pode mirar em si mesmo.
  const force = body?.force === true;
  let forcedUserId: string | undefined =
    typeof body?.user_id === "string" && body.user_id.trim() ? body.user_id.trim() : undefined;
  if (callerId) forcedUserId = callerId;
  if (force && !forcedUserId) return reject("force exige user_id", 400);

  // Find users whose settings match this minute
  const { data: settings, error: settingsErr } = await supabase
    .from("billing_notification_settings")
    .select("user_id, enabled, times, weekdays, workspace_id")
    .eq("enabled", true);

  if (settingsErr) {
    return new Response(JSON.stringify({ error: "Falha ao consultar as configurações" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targetUsers = (settings || []).filter((s: any) => {
    if (force) return s.user_id === forcedUserId;
    const times: string[] = Array.isArray(s.times) ? s.times : [];
    const weekdays: number[] = Array.isArray(s.weekdays) ? s.weekdays : [];
    return times.includes(hhmm) && weekdays.includes(weekday);
  });

  const results: any[] = [];

  for (const s of targetUsers) {
    // Count pending for this user
    const { count: pending } = await supabase
      .from("billing_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", s.user_id)
      .eq("workspace_id", s.workspace_id)
      .eq("status", "pending")
      .eq("week_start", weekStart)
      .is("carried_over_to", null);

    if (!pending || pending === 0) continue;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", s.user_id);

    if (!subs || subs.length === 0) continue;

    const payload = JSON.stringify({
      title: "Solicitações a cobrar",
      body: `Você tem ${pending} solicitação(ões) pendente(s) para cobrar.`,
      url: "/cobrar",
      tag: "billing-reminder",
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        results.push({ user: s.user_id, endpoint: sub.endpoint, ok: true });
      } catch (err: any) {
        const status = err?.statusCode;
        // 404/410 = subscription gone, clean up
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
        results.push({ user: s.user_id, endpoint: sub.endpoint, ok: false, status, error: err?.body || err?.message });
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, time: hhmm, weekday, matched: targetUsers.length, sent: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});