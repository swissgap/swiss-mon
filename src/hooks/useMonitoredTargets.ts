import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TargetWithStatus } from '@/types/target';
import { detectCategory } from '@/lib/targetUtils';

export interface MonitoredTarget extends TargetWithStatus {
  firstSeen: Date;
  lastAttacked: Date;
  isNewlyDetected: boolean;
}

const REFRESH_INTERVAL = 60_000;
const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

type Row = {
  host: string; ip: string | null; type: string | null; method: string | null;
  port: number; use_ssl: boolean; status: string; response_time: number | null;
  first_seen: string; last_attacked: string; last_checked: string | null;
};

export async function fetchMonitoredTargets(): Promise<MonitoredTarget[]> {
  const { data, error } = await supabase.from('monitored_targets').select('*').limit(1000);
  if (error) throw error;
  const now = Date.now();
  return ((data || []) as Row[]).map((r) => ({
    host: r.host,
    ip: r.ip || '',
    type: r.type || '',
    method: r.method || '',
    port: r.port,
    use_ssl: r.use_ssl,
    status: (['online', 'offline', 'warning'].includes(r.status) ? r.status : 'unknown') as TargetWithStatus['status'],
    responseTime: r.response_time ?? undefined,
    lastChecked: r.last_checked ? new Date(r.last_checked) : new Date(r.first_seen),
    category: detectCategory(r.host),
    firstSeen: new Date(r.first_seen),
    lastAttacked: new Date(r.last_attacked),
    isNewlyDetected: now - new Date(r.first_seen).getTime() < NEW_WINDOW_MS,
  }));
}

/** Read-only view of server-side monitoring; the server adds and checks targets. */
export function useMonitoredTargets() {
  const [monitoredTargets, setMonitoredTargets] = useState<MonitoredTarget[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const reload = useCallback(async () => {
    try { setMonitoredTargets(await fetchMonitoredTargets()); }
    catch (e) { console.error('Failed to load monitored targets:', e); }
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [reload]);

  const checkAllTargets = useCallback(async () => {
    setIsChecking(true);
    try {
      await supabase.functions.invoke('check-monitored');
      await reload();
    } finally { setIsChecking(false); }
  }, [reload]);

  return {
    monitoredTargets,
    isChecking,
    reload,
    checkAllTargets,
    newTargetsCount: monitoredTargets.filter((t) => t.isNewlyDetected).length,
  };
}
