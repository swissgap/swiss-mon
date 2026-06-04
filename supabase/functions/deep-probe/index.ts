// Deep DDoS-aware probe: latency drift, TLS timing, fingerprint, DNS consensus, anomaly score
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Target {
  host: string;
  port?: number;
  use_ssl?: boolean;
}

interface ProbeResult {
  host: string;
  p50_ms: number | null;
  p95_ms: number | null;
  jitter_ms: number | null;
  tls_ms: number | null;
  status_code: number | null;
  fingerprint: string | null;
  dns_consensus: boolean | null;
  score: number;
  severity: "ok" | "warning" | "alert";
  details: Record<string, unknown>;
}

const DOH_RESOLVERS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
  "https://dns.quad9.net:5053/dns-query",
];

async function dohLookup(host: string, resolver: string): Promise<string[]> {
  try {
    const url = `${resolver}?name=${encodeURIComponent(host)}&type=A`;
    const res = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.Answer ?? [])
      .filter((a: { type: number }) => a.type === 1)
      .map((a: { data: string }) => a.data)
      .sort();
  } catch {
    return [];
  }
}

async function dnsConsensus(host: string): Promise<{ ok: boolean; resolvers: Record<string, string[]> }> {
  const results = await Promise.all(DOH_RESOLVERS.map((r) => dohLookup(host, r)));
  const map: Record<string, string[]> = {};
  DOH_RESOLVERS.forEach((r, i) => (map[r] = results[i]));
  const nonEmpty = results.filter((r) => r.length > 0);
  if (nonEmpty.length < 2) return { ok: false, resolvers: map };
  const first = nonEmpty[0].join(",");
  const ok = nonEmpty.every((r) => r.join(",") === first);
  return { ok, resolvers: map };
}

async function tlsHandshakeMs(host: string, port: number): Promise<number | null> {
  try {
    const start = performance.now();
    const conn = await Deno.connect({ hostname: host, port });
    const tcpDone = performance.now();
    const tls = await Deno.startTls(conn, { hostname: host });
    const tlsDone = performance.now();
    try { tls.close(); } catch { /* ignore */ }
    return Math.round(tlsDone - tcpDone);
  } catch {
    return null;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function extractFingerprint(headers: Headers): string {
  const parts: string[] = [];
  const keys = ["server", "via", "cf-ray", "x-akamai-transformed", "x-cache", "x-amz-cf-id", "x-served-by"];
  for (const k of keys) {
    const v = headers.get(k);
    if (v) parts.push(`${k}=${v.slice(0, 40)}`);
  }
  if (headers.get("cf-mitigated") || headers.get("cf-chl-bypass")) parts.push("cf-challenge");
  return parts.join("|") || "none";
}

async function probeHost(target: Target, previousFingerprint: string | null, baselineP95: number | null): Promise<ProbeResult> {
  const host = target.host;
  const port = target.port ?? (target.use_ssl === false ? 80 : 443);
  const useSsl = target.use_ssl !== false;
  const url = `${useSsl ? "https" : "http"}://${host}${port === 80 || port === 443 ? "" : ":" + port}/`;

  const samples: number[] = [];
  let lastStatus: number | null = null;
  let lastHeaders: Headers | null = null;

  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { "user-agent": "SwissMon-DeepProbe/1.0" },
      });
      samples.push(performance.now() - t0);
      lastStatus = res.status;
      lastHeaders = res.headers;
    } catch {
      samples.push(6000);
    }
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = Math.round(percentile(sorted, 50));
  const p95 = Math.round(percentile(sorted, 95));
  const jitter = Math.round(sorted[sorted.length - 1] - sorted[0]);

  const tlsMs = useSsl ? await tlsHandshakeMs(host, port) : null;

  const fingerprint = lastHeaders ? extractFingerprint(lastHeaders) : "unreachable";

  const dns = await dnsConsensus(host);

  // Weighted anomaly score (0–100)
  let score = 0;
  const detail: Record<string, unknown> = { samples_ms: samples.map((s) => Math.round(s)) };

  // Latency drift (25%)
  if (baselineP95 && baselineP95 > 0) {
    const ratio = p95 / baselineP95;
    if (ratio > 3) score += 25;
    else if (ratio > 2) score += 15;
    else if (ratio > 1.5) score += 8;
    detail.latency_ratio = Number(ratio.toFixed(2));
  } else if (p95 > 3000) {
    score += 15;
  }

  // Jitter (10%)
  if (jitter > 1000) score += 10;
  else if (jitter > 300) score += 5;

  // TLS time (15%)
  if (useSsl) {
    if (tlsMs === null) score += 15;
    else if (tlsMs > 2000) score += 12;
    else if (tlsMs > 800) score += 6;
  }

  // HTTP status (20%)
  if (lastStatus === null) score += 20;
  else if (lastStatus >= 500) score += 18;
  else if (lastStatus === 429 || lastStatus === 503) score += 15;
  else if (lastStatus >= 400) score += 5;

  // Fingerprint drift (15%)
  if (previousFingerprint && previousFingerprint !== "none" && fingerprint !== previousFingerprint) {
    score += 15;
    detail.fingerprint_changed_from = previousFingerprint;
  }
  if (fingerprint.includes("cf-challenge")) score += 10;

  // DNS consensus (15%)
  if (!dns.ok) score += 15;
  detail.dns = dns.resolvers;

  score = Math.min(100, score);
  const severity: ProbeResult["severity"] = score >= 61 ? "alert" : score >= 31 ? "warning" : "ok";

  return {
    host,
    p50_ms: p50,
    p95_ms: p95,
    jitter_ms: jitter,
    tls_ms: tlsMs,
    status_code: lastStatus,
    fingerprint,
    dns_consensus: dns.ok,
    score,
    severity,
    details: detail,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { targets, persist = true } = (await req.json()) as { targets: Target[]; persist?: boolean };
    if (!Array.isArray(targets) || targets.length === 0) {
      return new Response(JSON.stringify({ error: "targets array required" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const hosts = targets.map((t) => t.host);
    // Load baseline + previous fingerprint per host (latest 20 rows over the last 7 days)
    const sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: history } = await admin
      .from("target_metrics")
      .select("host,p95_ms,fingerprint,checked_at")
      .in("host", hosts)
      .gte("checked_at", sinceIso)
      .order("checked_at", { ascending: false })
      .limit(500);

    const baselineMap = new Map<string, { p95: number | null; fp: string | null }>();
    for (const h of hosts) {
      const rows = (history ?? []).filter((r) => r.host === h);
      const p95s = rows.map((r) => r.p95_ms).filter((v): v is number => typeof v === "number");
      const median = p95s.length ? p95s.sort((a, b) => a - b)[Math.floor(p95s.length / 2)] : null;
      baselineMap.set(h, { p95: median, fp: rows[0]?.fingerprint ?? null });
    }

    const batchSize = Math.min(targets.length, 10);
    const slice = targets.slice(0, batchSize);
    const results = await Promise.all(
      slice.map((t) => {
        const b = baselineMap.get(t.host) ?? { p95: null, fp: null };
        return probeHost(t, b.fp, b.p95);
      }),
    );

    if (persist) {
      await admin.from("target_metrics").insert(
        results.map((r) => ({
          host: r.host,
          p50_ms: r.p50_ms,
          p95_ms: r.p95_ms,
          jitter_ms: r.jitter_ms,
          tls_ms: r.tls_ms,
          status_code: r.status_code,
          fingerprint: r.fingerprint,
          dns_consensus: r.dns_consensus,
          score: r.score,
          severity: r.severity,
          details: r.details,
        })),
      );
    }

    return new Response(JSON.stringify({ results, checked: results.length }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("deep-probe error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
