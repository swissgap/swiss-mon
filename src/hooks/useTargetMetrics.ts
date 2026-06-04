import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TargetMetric {
  id: string;
  host: string;
  checked_at: string;
  p50_ms: number | null;
  p95_ms: number | null;
  jitter_ms: number | null;
  tls_ms: number | null;
  status_code: number | null;
  fingerprint: string | null;
  dns_consensus: boolean | null;
  score: number;
  severity: 'ok' | 'warning' | 'alert';
}

export function useTargetMetrics(limit = 50) {
  const [metrics, setMetrics] = useState<TargetMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('target_metrics')
        .select('id,host,checked_at,p50_ms,p95_ms,jitter_ms,tls_ms,status_code,fingerprint,dns_consensus,score,severity')
        .order('checked_at', { ascending: false })
        .limit(limit);
      if (!cancelled) {
        setMetrics((data as TargetMetric[]) ?? []);
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [limit]);

  return { metrics, loading };
}
