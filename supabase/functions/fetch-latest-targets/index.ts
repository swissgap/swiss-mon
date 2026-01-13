import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

  try {
    const targetUrl = 'https://witha.name/data/last.json'
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'SwissMon/1.0 (+https://github.com/)',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
    }

    const rawData = await response.json()
    const rawTargets = normalizeTargets(rawData)

    const allTargets: ParsedTarget[] = []

    for (const entry of rawTargets) {
      const entryUrl = entry.target || entry.url || entry.host
      if (!entryUrl) continue

      const { host, port: parsedPort, use_ssl: parsedSsl } = parseHost(entryUrl)
      if (!host) continue

      const isSwiss = isSwissTarget(host)
      const isAdmin = isAdminTarget(host)

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
        is_swiss: isSwiss,
        is_admin: isAdmin
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

    return new Response(JSON.stringify({
      targets: allTargets,
      swiss_targets: swissTargets,
      other_targets: otherTargets,
      stats,
      fetched_at: new Date().toISOString()
    }), {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch targets'
    console.error('Error fetching latest targets:', errorMessage)
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        targets: [],
        swiss_targets: [],
        other_targets: [],
        stats: {
          total_requests: 0,
          total_hosts: 0,
          swiss_requests: 0,
          swiss_hosts: 0,
          admin_requests: 0,
          admin_hosts: 0
        }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
