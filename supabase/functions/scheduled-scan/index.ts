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
}

interface ParsedTarget {
  host: string;
  ip: string;
  type: string;
  method: string;
  port: number;
  use_ssl: boolean;
  is_swiss: boolean;
  is_admin: boolean;
}

interface ScanResult {
  scan_time: string;
  swiss_targets: ParsedTarget[];
  stats: {
    total_requests: number;
    swiss_hosts: number;
    admin_hosts: number;
  };
  notification_sent: boolean;
  notification_error?: string;
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
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if ('targets' in obj && Array.isArray(obj.targets)) return obj.targets;
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) return val;
    }
  }
  return [];
}

async function sendTeamsNotification(
  webhookUrl: string, 
  targets: ParsedTarget[], 
  stats: ScanResult['stats']
): Promise<{ sent: boolean; error?: string }> {
  try {
    const targetFacts = targets.slice(0, 15).map(t => ({
      title: t.is_admin ? `🛡️ ${t.host}` : `🇨🇭 ${t.host}`,
      value: `${t.ip || 'N/A'} | :${t.port} | ${t.type?.toUpperCase() || 'HTTP'}`
    }));

    const card = {
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "Container",
              style: "emphasis",
              items: [{
                type: "ColumnSet",
                columns: [
                  {
                    type: "Column",
                    width: "auto",
                    items: [{
                      type: "Image",
                      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Flag_of_Switzerland.svg/120px-Flag_of_Switzerland.svg.png",
                      size: "Small",
                      width: "40px"
                    }]
                  },
                  {
                    type: "Column",
                    width: "stretch",
                    items: [
                      {
                        type: "TextBlock",
                        text: "🔄 Scheduled Swiss Target Scan",
                        weight: "Bolder",
                        size: "Large",
                        color: "Attention"
                      },
                      {
                        type: "TextBlock",
                        text: `Automatischer Scan - ${new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}`,
                        spacing: "None",
                        isSubtle: true
                      }
                    ]
                  }
                ]
              }]
            },
            {
              type: "Container",
              items: [{
                type: "FactSet",
                facts: [
                  { title: "🇨🇭 Swiss Hosts", value: `${stats.swiss_hosts}` },
                  { title: "🛡️ Admin.ch Hosts", value: `${stats.admin_hosts}` },
                  { title: "📊 Total Scanned", value: `${stats.total_requests}` }
                ]
              }]
            },
            {
              type: "Container",
              items: [
                {
                  type: "TextBlock",
                  text: "Aktuelle Swiss Targets",
                  weight: "Bolder",
                  size: "Medium",
                  spacing: "Medium"
                },
                {
                  type: "FactSet",
                  facts: targetFacts
                }
              ]
            },
            ...(targets.length > 15 ? [{
              type: "TextBlock",
              text: `... und ${targets.length - 15} weitere Targets`,
              isSubtle: true,
              size: "Small"
            }] : [])
          ],
          actions: [{
            type: "Action.OpenUrl",
            title: "SwissMon Dashboard öffnen",
            url: "https://swiss-mon.lovable.app"
          }]
        }
      }]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { sent: false, error: `Teams webhook failed: ${response.status} - ${errorText}` };
    }

    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const scanTime = new Date().toISOString();
  console.log(`[${scanTime}] Starting scheduled Swiss target scan...`);

  try {
    // Parse optional webhook URL from request body (for manual triggers)
    let webhookUrl: string | null = null;
    try {
      const body = await req.json();
      webhookUrl = body?.webhookUrl || null;
    } catch {
      // No body or invalid JSON - that's fine for cron triggers
    }

    // Fetch targets from witha.name
    const targetUrl = 'https://witha.name/data/last.json';
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'SwissMon-Scheduler/1.0 (+https://swiss-mon.lovable.app)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();
    const rawTargets = normalizeTargets(rawData);

    // Parse and filter targets
    const allTargets: ParsedTarget[] = [];

    for (const entry of rawTargets) {
      const entryUrl = entry.target || entry.url || entry.host;
      if (!entryUrl) continue;

      const { host, port: parsedPort, use_ssl: parsedSsl } = parseHost(entryUrl);
      if (!host) continue;

      const isSwiss = isSwissTarget(host);
      const isAdmin = isAdminTarget(host);

      allTargets.push({
        host,
        ip: entry.ip || '',
        type: entry.type || entry.project || 'http',
        method: entry.method || 'GET',
        port: entry.port || parsedPort,
        use_ssl: entry.use_ssl ?? parsedSsl,
        is_swiss: isSwiss,
        is_admin: isAdmin
      });
    }

    const swissTargets = allTargets.filter(t => t.is_swiss);
    const uniqueSwissHosts = new Set(swissTargets.map(t => t.host));
    const uniqueAdminHosts = new Set(swissTargets.filter(t => t.is_admin).map(t => t.host));

    const stats = {
      total_requests: allTargets.length,
      swiss_hosts: uniqueSwissHosts.size,
      admin_hosts: uniqueAdminHosts.size,
    };

    console.log(`[${scanTime}] Scan complete: ${stats.swiss_hosts} Swiss hosts, ${stats.admin_hosts} admin.ch hosts`);

    // Send notification if webhook URL provided and Swiss targets found
    let notificationSent = false;
    let notificationError: string | undefined;

    if (webhookUrl && swissTargets.length > 0) {
      console.log(`[${scanTime}] Sending Teams notification...`);
      const result = await sendTeamsNotification(webhookUrl, swissTargets, stats);
      notificationSent = result.sent;
      notificationError = result.error;
      
      if (result.sent) {
        console.log(`[${scanTime}] Teams notification sent successfully`);
      } else {
        console.error(`[${scanTime}] Teams notification failed: ${result.error}`);
      }
    }

    const scanResult: ScanResult = {
      scan_time: scanTime,
      swiss_targets: swissTargets,
      stats,
      notification_sent: notificationSent,
      notification_error: notificationError,
    };

    return new Response(JSON.stringify(scanResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Scheduled scan failed';
    console.error(`[${scanTime}] Error:`, errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        scan_time: scanTime,
        swiss_targets: [],
        stats: { total_requests: 0, swiss_hosts: 0, admin_hosts: 0 },
        notification_sent: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
