import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Row { host: string; port: number; use_ssl: boolean }

async function check(t: Row) {
  const proto = t.use_ssl ? "https" : "http";
  const port = t.port === 80 || t.port === 443 ? "" : `:${t.port}`;
  const start = performance.now();
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${proto}://${t.host}${port}`, {
      method: "HEAD", redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": "SwissMon/1.0 (Health Check)" },
    });
    clearTimeout(to);
    await res.body?.cancel();
    const ms = Math.round(performance.now() - start);
    let status = "online";
    if (res.status >= 500) status = "offline";
    else if (ms > 3000) status = "warning";
    return { status, response_time: ms, status_code: res.status };
  } catch (e) {
    const ms = Math.round(performance.now() - start);
    const msg = e instanceof Error ? e.message : "";
    return { status: msg.includes("abort") || ms > 7500 ? "warning" : "offline", response_time: ms, status_code: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data, error } = await db.from("monitored_targets").select("host, port, use_ssl").limit(500);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const rows = (data || []) as Row[];
  const now = new Date().toISOString();
  let checked = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const results = await Promise.all(batch.map(check));
    await Promise.all(batch.map((t, j) =>
      db.from("monitored_targets").update({ ...results[j], last_checked: now }).eq("host", t.host)
    ));
    checked += batch.length;
  }
  return new Response(JSON.stringify({ checked, at: now }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
