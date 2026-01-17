import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SwissTarget {
  host: string;
  ip?: string;
  type?: string;
  method?: string;
  port?: number;
  use_ssl?: boolean;
  is_admin?: boolean;
}

interface TelegramPayload {
  botToken?: string;
  chatId: string;
  targets: SwissTarget[];
  stats: {
    swiss_hosts: number;
    admin_hosts: number;
    total_requests: number;
  };
  isTest?: boolean;
}

function formatTelegramMessage(targets: SwissTarget[], stats: TelegramPayload['stats'], isTest: boolean = false): string {
  const lines: string[] = [];
  
  if (isTest) {
    lines.push('🧪 *SwissMon Test Notification*');
    lines.push('');
    lines.push('✅ Telegram Webhook ist korrekt konfiguriert\\!');
    lines.push(`📅 Test gesendet: ${new Date().toLocaleString('de-CH').replace(/[.-]/g, '\\$&')}`);
    lines.push('');
  } else {
    lines.push('🚨 *Swiss Target Alert*');
    lines.push('');
  }
  
  lines.push('📊 *Statistiken:*');
  lines.push(`   🇨🇭 Swiss Hosts: ${stats.swiss_hosts}`);
  lines.push(`   🛡️ Admin\\.ch Hosts: ${stats.admin_hosts}`);
  lines.push(`   📈 Total Requests: ${stats.total_requests}`);
  lines.push('');
  
  lines.push(isTest ? '🎯 *Sample Targets:*' : '🎯 *Detected Targets:*');
  
  const displayTargets = targets.slice(0, 10);
  for (const target of displayTargets) {
    const icon = target.is_admin ? '🛡️' : '🇨🇭';
    const host = target.host.replace(/[.-]/g, '\\$&');
    const ip = (target.ip || 'N/A').replace(/[.]/g, '\\$&');
    const port = target.port || 443;
    const type = (target.type || 'HTTP').toUpperCase();
    lines.push(`${icon} \`${host}\``);
    lines.push(`   IP: ${ip} \\| Port: ${port} \\| ${type}`);
  }
  
  if (targets.length > 10) {
    lines.push('');
    lines.push(`_\\.\\.\\. und ${targets.length - 10} weitere Targets_`);
  }
  
  lines.push('');
  lines.push('🔗 [SwissMon Dashboard öffnen](https://swiss-mon.lovable.app)');
  
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { botToken: clientBotToken, chatId, targets, stats, isTest }: TelegramPayload = await req.json()
    
    // Use client-provided token, or fall back to environment variable
    const botToken = clientBotToken || Deno.env.get('TELEGRAM_BOT_TOKEN')
    
    if (!botToken) {
      console.error('No Telegram bot token provided')
      return new Response(
        JSON.stringify({ error: 'Telegram Bot Token nicht konfiguriert. Bitte Token eingeben.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!chatId) {
      return new Response(
        JSON.stringify({ error: 'Telegram Chat ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!targets || targets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No targets to notify', sent: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const message = formatTelegramMessage(targets, stats, isTest)
    
    console.log(`Sending Telegram ${isTest ? 'TEST ' : ''}notification to chat ${chatId}...`)
    
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
      }),
    })

    const responseData = await response.json()

    if (!response.ok) {
      console.error('Telegram API error:', responseData)
      throw new Error(`Telegram API failed: ${responseData.description || response.status}`)
    }

    console.log('Telegram notification sent successfully')

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: true,
        targetsNotified: targets.length,
        message: 'Notification sent to Telegram'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to send notification'
    console.error('Error sending Telegram notification:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage, sent: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
