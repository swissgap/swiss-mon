import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
  notifications: {
    teams_sent: boolean;
    teams_error?: string;
    telegram_sent: boolean;
    telegram_error?: string;
  };
}

interface NotificationSettings {
  teams_webhook_url?: string;
  teams_auto_notify?: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  telegram_auto_notify?: boolean;
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

async function sendTelegramNotification(
  botToken: string,
  chatId: string,
  targets: ParsedTarget[],
  stats: ScanResult['stats']
): Promise<{ sent: boolean; error?: string }> {
  try {
    const swissHosts = targets.filter(t => !t.is_admin).slice(0, 10);
    const adminHosts = targets.filter(t => t.is_admin).slice(0, 5);
    
    let message = `🔄 <b>Scheduled Swiss Target Scan</b>\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `📊 <b>Statistiken:</b>\n`;
    message += `├ 🇨🇭 Swiss Hosts: <code>${stats.swiss_hosts}</code>\n`;
    message += `├ 🛡️ Admin.ch Hosts: <code>${stats.admin_hosts}</code>\n`;
    message += `└ 📈 Total Scanned: <code>${stats.total_requests}</code>\n\n`;
    
    if (adminHosts.length > 0) {
      message += `🛡️ <b>Admin.ch Targets:</b>\n`;
      adminHosts.forEach((t, i) => {
        const prefix = i === adminHosts.length - 1 ? '└' : '├';
        message += `${prefix} <code>${t.host}</code>\n`;
        message += `   ${t.ip || 'N/A'} | :${t.port}\n`;
      });
      message += `\n`;
    }
    
    if (swissHosts.length > 0) {
      message += `🇨🇭 <b>Swiss Targets:</b>\n`;
      swissHosts.forEach((t, i) => {
        const prefix = i === swissHosts.length - 1 ? '└' : '├';
        message += `${prefix} <code>${t.host}</code>\n`;
      });
      
      if (targets.length > 15) {
        message += `\n<i>... und ${targets.length - 15} weitere</i>\n`;
      }
    }
    
    message += `\n⏰ ${new Date().toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}`;
    
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const responseData = await response.json();

    if (!response.ok || !responseData.ok) {
      return { 
        sent: false, 
        error: responseData.description || `Telegram API error: ${response.status}` 
      };
    }

    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function getNotificationSettings(supabaseUrl: string, supabaseKey: string): Promise<NotificationSettings> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data, error } = await supabase
      .from('notification_settings')
      .select('setting_key, setting_value, is_enabled');

    if (error) {
      console.error('Error fetching notification settings:', error);
      return {};
    }

    const settings: NotificationSettings = {};
    
    for (const row of data || []) {
      switch (row.setting_key) {
        case 'teams_webhook_url':
          settings.teams_webhook_url = row.setting_value || undefined;
          break;
        case 'teams_auto_notify':
          settings.teams_auto_notify = row.setting_value === 'true' && row.is_enabled;
          break;
        case 'telegram_bot_token':
          settings.telegram_bot_token = row.setting_value || undefined;
          break;
        case 'telegram_chat_id':
          settings.telegram_chat_id = row.setting_value || undefined;
          break;
        case 'telegram_auto_notify':
          settings.telegram_auto_notify = row.setting_value === 'true' && row.is_enabled;
          break;
      }
    }

    return settings;
  } catch (error) {
    console.error('Error in getNotificationSettings:', error);
    return {};
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
    // Get Supabase credentials from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase credentials');
    }

    // Get notification settings from database
    const settings = await getNotificationSettings(supabaseUrl, supabaseKey);
    console.log(`[${scanTime}] Loaded notification settings - Teams auto: ${settings.teams_auto_notify}, Telegram auto: ${settings.telegram_auto_notify}`);

    // Parse optional overrides from request body (for manual triggers)
    let manualWebhookUrl: string | null = null;
    let manualTelegramToken: string | null = null;
    let manualTelegramChatId: string | null = null;
    
    try {
      const body = await req.json();
      manualWebhookUrl = body?.webhookUrl || null;
      manualTelegramToken = body?.telegramBotToken || null;
      manualTelegramChatId = body?.telegramChatId || null;
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

    // Server-side deduplication: filter to only Swiss targets we haven't notified about yet
    const supabaseClient = createClient(supabaseUrl, supabaseKey);
    const swissHostsArray = Array.from(uniqueSwissHosts);
    let newTargets: ParsedTarget[] = swissTargets;
    let newHostsCount = stats.swiss_hosts;

    if (swissHostsArray.length > 0) {
      const { data: alreadyNotified } = await supabaseClient
        .from('notified_hosts')
        .select('host')
        .in('host', swissHostsArray);

      const alreadyNotifiedSet = new Set((alreadyNotified || []).map((r: { host: string }) => r.host));
      newTargets = swissTargets.filter(t => !alreadyNotifiedSet.has(t.host));
      newHostsCount = new Set(newTargets.map(t => t.host)).size;

      // Update last_seen_at for all currently-seen hosts (upsert pattern)
      const upserts = swissHostsArray.map(host => ({
        host,
        last_seen_at: scanTime,
        is_admin: uniqueAdminHosts.has(host),
      }));
      const { error: upsertErr } = await supabaseClient
        .from('notified_hosts')
        .upsert(upserts, { onConflict: 'host', ignoreDuplicates: false });
      if (upsertErr) console.error(`[${scanTime}] Upsert notified_hosts failed:`, upsertErr);
    }

    console.log(`[${scanTime}] Deduplication: ${newHostsCount} NEW hosts of ${stats.swiss_hosts} total`);

    // Deep DDoS-aware probing for new Swiss targets (latency drift, TLS, fingerprint, DNS consensus)
    if (newTargets.length > 0) {
      try {
        const probeTargets = Array.from(new Map(newTargets.map(t => [t.host, t])).values())
          .slice(0, 10)
          .map(t => ({ host: t.host, port: t.port, use_ssl: t.use_ssl }));
        const probeRes = await fetch(`${supabaseUrl}/functions/v1/deep-probe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ targets: probeTargets, persist: true }),
        });
        console.log(`[${scanTime}] Deep-probe triggered for ${probeTargets.length} hosts (status ${probeRes.status})`);
      } catch (e) {
        console.error(`[${scanTime}] Deep-probe call failed:`, e);
      }
    }

    // Initialize notification results
    const notifications = {
      teams_sent: false,
      teams_error: undefined as string | undefined,
      telegram_sent: false,
      telegram_error: undefined as string | undefined,
    };

    // Only notify when we have NEW Swiss targets (or when manually triggered)
    const isManualTrigger = !!(manualWebhookUrl || manualTelegramToken);
    const targetsForNotification = isManualTrigger ? swissTargets : newTargets;
    const statsForNotification = isManualTrigger
      ? stats
      : {
          total_requests: newTargets.length,
          swiss_hosts: newHostsCount,
          admin_hosts: new Set(newTargets.filter(t => t.is_admin).map(t => t.host)).size,
        };

    if (targetsForNotification.length > 0) {
      const teamsWebhook = manualWebhookUrl || (settings.teams_auto_notify ? settings.teams_webhook_url : null);
      if (teamsWebhook) {
        console.log(`[${scanTime}] Sending Teams notification for ${targetsForNotification.length} targets...`);
        const teamsResult = await sendTeamsNotification(teamsWebhook, targetsForNotification, statsForNotification);
        notifications.teams_sent = teamsResult.sent;
        notifications.teams_error = teamsResult.error;
      }

      const telegramToken = manualTelegramToken || (settings.telegram_auto_notify ? settings.telegram_bot_token : null);
      const telegramChatId = manualTelegramChatId || (settings.telegram_auto_notify ? settings.telegram_chat_id : null);
      if (telegramToken && telegramChatId) {
        console.log(`[${scanTime}] Sending Telegram notification for ${targetsForNotification.length} targets...`);
        const telegramResult = await sendTelegramNotification(telegramToken, telegramChatId, targetsForNotification, statsForNotification);
        notifications.telegram_sent = telegramResult.sent;
        notifications.telegram_error = telegramResult.error;
      }
    } else {
      console.log(`[${scanTime}] No new targets — skipping notifications`);
    }

    const scanResult: ScanResult = {
      scan_time: scanTime,
      swiss_targets: swissTargets,
      stats,
      notifications,
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
        notifications: {
          teams_sent: false,
          telegram_sent: false,
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
