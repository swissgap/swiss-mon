import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KEYS = ["teams_webhook_url", "teams_auto_notify", "telegram_bot_token", "telegram_bot_name", "telegram_chat_id", "telegram_auto_notify"] as const;
type Key = typeof KEYS[number];

function mask(v: string | null | undefined, keep = 4) {
  if (!v) return "";
  return v.length <= keep ? "••••" : "••••" + v.slice(-keep);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const TEST_TARGETS = [
  { host: "test.example.ch", ip: "192.0.2.1", type: "TEST", method: "GET", port: 443, use_ssl: true, is_admin: false },
  { host: "admin.ch", ip: "192.0.2.2", type: "TEST", method: "GET", port: 443, use_ssl: true, is_admin: true },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, key);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action || "get");

  const { data: rows, error } = await db.from("notification_settings").select("setting_key, setting_value");
  if (error) return json({ error: "Einstellungen konnten nicht geladen werden" }, 500);
  const s: Partial<Record<Key, string>> = {};
  for (const r of rows || []) s[r.setting_key as Key] = r.setting_value ?? "";

  if (action === "get") {
    return json({
      teams_configured: (s.teams_webhook_url || "").startsWith("https://"),
      teams_webhook_hint: mask(s.teams_webhook_url, 6),
      teams_auto_notify: s.teams_auto_notify === "true",
      telegram_configured: !!s.telegram_bot_token && !!s.telegram_chat_id,
      telegram_token_hint: mask(s.telegram_bot_token),
      telegram_bot_name: s.telegram_bot_name || "",
      telegram_chat_hint: mask(s.telegram_chat_id, 3),
      telegram_auto_notify: s.telegram_auto_notify === "true",
      password_set: !!Deno.env.get("ADMIN_PASSWORD"),
    });
  }

  const adminPw = Deno.env.get("ADMIN_PASSWORD");
  const given = String(body.password || "");
  if (!adminPw) return json({ error: "Admin-Passwort ist noch nicht eingerichtet" }, 503);
  if (!given || !safeEqual(given, adminPw)) return json({ error: "Falsches Passwort" }, 401);

  if (action === "verify") return json({ ok: true });

  if (action === "save") {
    const updates = (body.updates || {}) as Record<string, unknown>;
    for (const k of KEYS) {
      if (!(k in updates)) continue;
      const v = updates[k];
      if (typeof v !== "string" && typeof v !== "boolean") continue;
      const val = String(v).slice(0, 1000);
      if (k === "teams_webhook_url" && val && !val.startsWith("https://")) return json({ error: "Webhook muss mit https:// beginnen" }, 400);
      const enabled = k.endsWith("auto_notify") ? val === "true" : val.length > 0;
      const { data: existing } = await db.from("notification_settings").select("id").eq("setting_key", k).maybeSingle();
      const res = existing
        ? await db.from("notification_settings").update({ setting_value: val, is_enabled: enabled }).eq("setting_key", k)
        : await db.from("notification_settings").insert({ setting_key: k, setting_value: val, is_enabled: enabled });
      if (res.error) return json({ error: `Speichern fehlgeschlagen (${k})` }, 500);
    }
    return json({ ok: true });
  }

  if (action === "test-teams" || action === "test-telegram") {
    const isTeams = action === "test-teams";
    const fn = isTeams ? "notify-teams" : "notify-telegram";
    if (isTeams && !s.teams_webhook_url) return json({ error: "Kein Teams-Webhook gespeichert" }, 400);
    if (!isTeams && (!s.telegram_bot_token || !s.telegram_chat_id)) return json({ error: "Telegram nicht vollständig gespeichert" }, 400);
    const payload = isTeams
      ? { webhookUrl: s.teams_webhook_url }
      : { botToken: s.telegram_bot_token, chatId: s.telegram_chat_id };
    const r = await fetch(`${url}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ...payload, targets: TEST_TARGETS, stats: { swiss_hosts: 2, admin_hosts: 1, total_requests: 2 }, isTest: true }),
    });
    const out = await r.json().catch(() => ({}));
    return json({ sent: !!out?.sent, error: out?.error });
  }

  return json({ error: "Unbekannte Aktion" }, 400);
});
