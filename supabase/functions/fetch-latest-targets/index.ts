import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RawTarget {
  target?: string;
  url?: string;
  host?: string;
  ip?: string;
  type?: string;
  project?: string;
  method?: string;
  port?: number;
  use_ssl?: boolean;
  path?: string;
  target_id?: string;
  request_id?: string;
}

interface ParsedTarget {
  target_id: string;
  request_id: string;
  host: string;
  ip: string;
  type: string;
  method: string;
  port: number;
  use_ssl: boolean;
  path: string;
  is_swiss: boolean;
  is_admin: boolean;
}

function parseHost(targetUrl: string): { host: string; port: number; use_ssl: boolean } {
  try {
    const urlWithProtocol = targetUrl.includes('://') ? targetUrl : `http://${targetUrl}`;
    const parsed = new URL(urlWithProtocol);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
      use_ssl: parsed.protocol === 'https:'
    };
  } catch {
    return { host: targetUrl, port: 80, use_ssl: false };
  }
}

function isSwissTarget(host: string): boolean {
  if (!host) return false;
  const lowerHost = host.toLowerCase();
  return lowerHost.endsWith('.ch') || lowerHost.includes('.ch.');
}

function isAdminTarget(host: string): boolean {
  if (!host) return false;
  const lowerHost = host.toLowerCase();
  return lowerHost.includes('admin.ch');
}

function normalizeTargets(data: unknown): RawTarget[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if ('targets' in obj && Array.isArray(obj.targets)) {
      return obj.targets;
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        return val;
      }
    }
  }
  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Try multiple source URLs (origin + public mirrors/proxies) to survive
  // upstream rejecting Supabase edge IPs ("Connection refused").
  const sourceUrls = [
    'https://witha.name/data/last.json',
    'https://www.witha.name/data/last.json',
    'http://witha.name/data/last.json',
    // Public read-only CORS/HTTP mirrors as fallback
    'https://r.jina.ai/https://witha.name/data/last.json',
    'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://witha.name/data/last.json'),
  ]

  let rawData: unknown = null
  let lastError = ''
  let usedSource = ''

  for (const url of sourceUrls) {
    try {
      const ctrl = new AbortController()
      const to = setTimeout(() => ctrl.abort(), 25000)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SwissMon/1.0; +https://swiss-mon.lovable.app)',
          'Accept': 'application/json, text/plain, */*',
        },
        signal: ctrl.signal,
      })
      clearTimeout(to)

      if (!response.ok) {
        lastError = `HTTP ${response.status} from ${url}`
        await response.text().catch(() => '')
        continue
      }

      const text = await response.text()
      try {
        rawData = JSON.parse(text)
      } catch {
        // r.jina.ai may wrap content; try to find JSON
        const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
        if (!match) {
          lastError = `Non-JSON response from ${url}`
          continue
        }
        rawData = JSON.parse(match[0])
      }
      usedSource = url
      break
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      continue
    }
  }

  if (rawData === null) {
    console.error('All source fetches failed. Last error:', lastError)
    // Serve the last successful scan instead of an empty list
    const { data: snap } = await db.from('scan_snapshots').select('payload, fetched_at').order('fetched_at', { ascending: false }).limit(1).maybeSingle()
    const base = snap?.payload ?? {
      targets: [], swiss_targets: [], other_targets: [],
      stats: { total_requests: 0, total_hosts: 0, swiss_requests: 0, swiss_hosts: 0, admin_requests: 0, admin_hosts: 0 },
    }
    return new Response(
      JSON.stringify({
        ...base,
        stale: true,
        cached_at: snap?.fetched_at ?? null,
        warning: `Quelle nicht erreichbar: ${lastError}`,
        fetched_at: snap?.fetched_at ?? new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const rawTargets = normalizeTargets(rawData)

    const allTargets: ParsedTarget[] = []

    for (const entry of rawTargets) {
      const entryUrl = entry.target || entry.url || entry.host
      if (!entryUrl) continue

      const { host, port: parsedPort, use_ssl: parsedSsl } = parseHost(entryUrl)
      if (!host) continue

      allTargets.push({
        target_id: entry.target_id || `target-${allTargets.length}`,
        request_id: entry.request_id || `req-${allTargets.length}`,
        host,
        ip: entry.ip || '',
        type: entry.type || entry.project || 'http',
        method: entry.method || 'GET',
        port: entry.port || parsedPort,
        use_ssl: entry.use_ssl ?? parsedSsl,
        path: entry.path || '/',
        is_swiss: isSwissTarget(host),
        is_admin: isAdminTarget(host),
      })
    }

    const swissTargets = allTargets.filter(t => t.is_swiss)
    const otherTargets = allTargets.filter(t => !t.is_swiss)

    const stats = {
      total_requests: allTargets.length,
      total_hosts: new Set(allTargets.map(t => t.host)).size,
      swiss_requests: swissTargets.length,
      swiss_hosts: new Set(swissTargets.map(t => t.host)).size,
      admin_requests: swissTargets.filter(t => t.is_admin).length,
      admin_hosts: new Set(swissTargets.filter(t => t.is_admin).map(t => t.host)).size,
    }

    const fetchedAt = new Date().toISOString()
    const payload = { targets: allTargets, swiss_targets: swissTargets, other_targets: otherTargets, stats, source: usedSource }

    // Persist snapshot (keep last 50) and add Swiss hosts to monitoring
    try {
      await db.from('scan_snapshots').insert({ payload, source: usedSource, fetched_at: fetchedAt })
      const { data: old } = await db.from('scan_snapshots').select('id').order('fetched_at', { ascending: false }).range(50, 500)
      if (old?.length) await db.from('scan_snapshots').delete().in('id', old.map((r: { id: string }) => r.id))
      const uniq = new Map(swissTargets.map(t => [t.host.toLowerCase(), t]))
      if (uniq.size) {
        const hosts = Array.from(uniq.keys())
        const { data: existing } = await db.from('monitored_targets').select('host').in('host', hosts)
        const known = new Set((existing || []).map((r: { host: string }) => r.host))
        const fresh = hosts.filter(h => !known.has(h)).map(h => {
          const t = uniq.get(h)!
          return { host: h, ip: t.ip, type: t.type, method: t.method, port: t.port, use_ssl: t.use_ssl, is_admin: t.is_admin, first_seen: fetchedAt, last_attacked: fetchedAt }
        })
        if (fresh.length) await db.from('monitored_targets').insert(fresh)
        if (known.size) await db.from('monitored_targets').update({ last_attacked: fetchedAt }).in('host', Array.from(known))
      }
    } catch (e) {
      console.error('Persist failed:', e)
    }

    return new Response(
      JSON.stringify({
        targets: allTargets,
        swiss_targets: swissTargets,
        other_targets: otherTargets,
        stats,
        source: usedSource,
        fetched_at: fetchedAt,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
        },
      }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse targets'
    console.error('Parse error:', errorMessage)
    return new Response(
      JSON.stringify({
        warning: errorMessage,
        targets: [],
        swiss_targets: [],
        other_targets: [],
        stats: {
          total_requests: 0, total_hosts: 0,
          swiss_requests: 0, swiss_hosts: 0,
          admin_requests: 0, admin_hosts: 0,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
