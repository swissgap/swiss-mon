import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Target {
  host: string;
  ip: string;
  type: string;
  method: string;
  port: number;
  use_ssl: boolean;
}

interface CheckResult {
  host: string;
  status: 'online' | 'offline' | 'warning';
  responseTime: number;
  statusCode?: number;
  error?: string;
}

async function checkTarget(target: Target): Promise<CheckResult> {
  const protocol = target.use_ssl ? 'https' : 'http';
  const port = target.port === 80 || target.port === 443 ? '' : `:${target.port}`;
  const url = `${protocol}://${target.host}${port}`;
  
  const startTime = performance.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
    
    const response = await fetch(url, {
      method: 'HEAD', // Use HEAD for faster checks
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'SwissMon/1.0 (Health Check)',
      },
    });
    
    clearTimeout(timeoutId);
    const responseTime = Math.round(performance.now() - startTime);
    
    // Determine status based on response code and time
    let status: 'online' | 'offline' | 'warning' = 'online';
    
    if (response.status >= 500) {
      status = 'offline';
    } else if (response.status >= 400 && response.status < 500) {
      // 4xx might still mean the server is up (just blocking/auth required)
      status = responseTime > 2000 ? 'warning' : 'online';
    } else if (responseTime > 3000) {
      status = 'warning';
    } else if (responseTime > 5000) {
      status = 'offline';
    }
    
    return {
      host: target.host,
      status,
      responseTime,
      statusCode: response.status,
    };
  } catch (error) {
    const responseTime = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a timeout vs connection refused
    if (errorMessage.includes('abort') || responseTime > 7500) {
      return {
        host: target.host,
        status: 'warning', // Timeout might mean slow, not necessarily offline
        responseTime,
        error: 'Timeout',
      };
    }
    
    return {
      host: target.host,
      status: 'offline',
      responseTime,
      error: errorMessage,
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { targets } = await req.json() as { targets: Target[] };
    
    if (!targets || !Array.isArray(targets)) {
      return new Response(
        JSON.stringify({ error: 'Invalid targets array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit batch size to prevent timeout
    const batchSize = Math.min(targets.length, 20);
    const batch = targets.slice(0, batchSize);
    
    // Check all targets in parallel
    const results = await Promise.all(batch.map(checkTarget));
    
    return new Response(
      JSON.stringify({ 
        results,
        checked: results.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking targets:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to check targets' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
