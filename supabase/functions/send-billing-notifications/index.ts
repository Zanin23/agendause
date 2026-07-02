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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { hhmm, weekday } = nowInTz();
  const weekStart = currentWeekStart();

  // Body may override (for manual test): { force: true, user_id?: string }
  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {}

  // Find users whose settings match this minute
  const { data: settings, error: settingsErr } = await supabase
    .from("billing_notification_settings")
    .select("user_id, enabled, times, weekdays")
    .eq("enabled", true);

  if (settingsErr) {
    return new Response(JSON.stringify({ error: settingsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const targetUsers = (settings || []).filter((s: any) => {
    if (body?.force && (!body.user_id || body.user_id === s.user_id)) return true;
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