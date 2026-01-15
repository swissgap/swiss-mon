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

interface TeamsPayload {
  webhookUrl: string;
  targets: SwissTarget[];
  stats: {
    swiss_hosts: number;
    admin_hosts: number;
    total_requests: number;
  };
  isTest?: boolean;
}

function createAdaptiveCard(targets: SwissTarget[], stats: TeamsPayload['stats'], isTest: boolean = false) {
  const targetFacts = targets.slice(0, 10).map(t => ({
    title: t.is_admin ? `🛡️ ${t.host}` : `🇨🇭 ${t.host}`,
    value: `${t.ip || 'N/A'} | :${t.port} | ${t.type?.toUpperCase() || 'HTTP'}`
  }));

  const titleText = isTest ? "🧪 SwissMon Test Notification" : "🚨 Swiss Target Alert";
  const subtitleText = isTest 
    ? "This is a test message - Webhook is working!" 
    : `${stats.swiss_hosts} Swiss hosts detected`;

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "Container",
              style: isTest ? "default" : "emphasis",
              items: [
                {
                  type: "ColumnSet",
                  columns: [
                    {
                      type: "Column",
                      width: "auto",
                      items: [
                        {
                          type: "Image",
                          url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Flag_of_Switzerland.svg/120px-Flag_of_Switzerland.svg.png",
                          size: "Small",
                          width: "40px"
                        }
                      ]
                    },
                    {
                      type: "Column",
                      width: "stretch",
                      items: [
                        {
                          type: "TextBlock",
                          text: titleText,
                          weight: "Bolder",
                          size: "Large",
                          color: isTest ? "Good" : "Attention"
                        },
                        {
                          type: "TextBlock",
                          text: subtitleText,
                          spacing: "None",
                          isSubtle: true
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            ...(isTest ? [{
              type: "Container",
              items: [
                {
                  type: "TextBlock",
                  text: "✅ Your MS Teams webhook is correctly configured!",
                  weight: "Bolder",
                  color: "Good",
                  wrap: true
                },
                {
                  type: "TextBlock",
                  text: `Test sent at: ${new Date().toLocaleString('de-CH')}`,
                  isSubtle: true,
                  size: "Small"
                }
              ]
            }] : []),
            {
              type: "Container",
              items: [
                {
                  type: "FactSet",
                  facts: [
                    {
                      title: "🇨🇭 Swiss Hosts",
                      value: `${stats.swiss_hosts}`
                    },
                    {
                      title: "🛡️ Admin.ch Hosts",
                      value: `${stats.admin_hosts}`
                    },
                    {
                      title: "📊 Total Requests",
                      value: `${stats.total_requests}`
                    }
                  ]
                }
              ]
            },
            {
              type: "Container",
              items: [
                {
                  type: "TextBlock",
                  text: isTest ? "Sample Targets" : "Detected Targets",
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
            ...(targets.length > 10 ? [{
              type: "TextBlock",
              text: `... and ${targets.length - 10} more targets`,
              isSubtle: true,
              size: "Small"
            }] : [])
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "Open SwissMon Dashboard",
              url: "https://swiss-mon.lovable.app"
            }
          ]
        }
      }
    ]
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { webhookUrl, targets, stats, isTest }: TeamsPayload = await req.json()

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: 'MS Teams Webhook URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!targets || targets.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No targets to notify', sent: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const card = createAdaptiveCard(targets, stats, isTest)

    console.log(`Sending MS Teams ${isTest ? 'TEST ' : ''}notification to webhook...`)
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(card),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('MS Teams webhook error:', errorText)
      throw new Error(`Teams webhook failed: ${response.status} - ${errorText}`)
    }

    console.log('MS Teams notification sent successfully')

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: true,
        targetsNotified: targets.length,
        message: 'Notification sent to MS Teams'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to send notification'
    console.error('Error sending Teams notification:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage, sent: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
