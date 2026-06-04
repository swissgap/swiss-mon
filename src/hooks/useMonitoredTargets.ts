import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TargetWithStatus } from '@/types/target';
import { detectCategory } from '@/lib/targetUtils';

interface SwissTarget {
  host: string;
  ip: string;
  type: string;
  method: string;
  port: number;
  use_ssl: boolean;
  is_admin?: boolean;
  first_seen?: string;
}

interface MonitoredTarget extends TargetWithStatus {
  firstSeen: Date;
  lastAttacked: Date;
  isNewlyDetected: boolean;
}

const STORAGE_KEY = 'swissmon_monitored_targets';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 20;

export function useMonitoredTargets() {
  const [monitoredTargets, setMonitoredTargets] = useState<MonitoredTarget[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetsRef = useRef<MonitoredTarget[]>([]);

  // Keep ref in sync to avoid stale closures in interval
  useEffect(() => {
    targetsRef.current = monitoredTargets;
  }, [monitoredTargets]);

  // Load stored targets from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as MonitoredTarget[];
      setMonitoredTargets(
        parsed.map((t) => ({
          ...t,
          firstSeen: new Date(t.firstSeen),
          lastAttacked: new Date(t.lastAttacked),
          lastChecked: new Date(t.lastChecked),
          isNewlyDetected: false,
        }))
      );
    } catch (e) {
      console.error('Failed to parse stored targets:', e);
    }
  }, []);

  // Persist
  useEffect(() => {
    if (monitoredTargets.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(monitoredTargets));
    }
  }, [monitoredTargets]);

  // Add new Swiss targets to monitoring
  const addSwissTargets = useCallback((swissTargets: SwissTarget[]) => {
    const now = new Date();
    setMonitoredTargets((current) => {
      const map = new Map(current.map((t) => [t.host.toLowerCase(), t]));
      let changed = false;
      for (const t of swissTargets) {
        const key = t.host.toLowerCase();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            host: t.host,
            ip: t.ip,
            type: t.type,
            method: t.method,
            port: t.port,
            use_ssl: t.use_ssl,
            status: 'unknown',
            responseTime: undefined,
            lastChecked: now,
            category: detectCategory(t.host),
            firstSeen: t.first_seen ? new Date(t.first_seen) : now,
            lastAttacked: now,
            isNewlyDetected: true,
          });
          changed = true;
        } else if (existing.lastAttacked.getTime() !== now.getTime()) {
          map.set(key, { ...existing, lastAttacked: now });
          changed = true;
        }
      }
      return changed ? Array.from(map.values()) : current;
    });
  }, []);

  // Check all monitored targets via reliable server-side edge function
  const checkAllTargets = useCallback(async () => {
    const targets = targetsRef.current;
    if (isChecking || targets.length === 0) return;

    setIsChecking(true);
    try {
      const resultsMap = new Map<string, { status: 'online' | 'offline' | 'warning'; responseTime: number }>();
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE).map((t) => ({
          host: t.host,
          ip: t.ip,
          type: t.type,
          method: t.method,
          port: t.port,
          use_ssl: t.use_ssl,
        }));
        const { data, error } = await supabase.functions.invoke('check-target-status', {
          body: { targets: batch },
        });
        if (error) {
          console.error('check-target-status failed:', error);
          continue;
        }
        for (const r of data?.results || []) {
          resultsMap.set(r.host, { status: r.status, responseTime: r.responseTime });
        }
      }

      const now = new Date();
      setMonitoredTargets((current) =>
        current.map((t) => {
          const r = resultsMap.get(t.host);
          return r
            ? { ...t, status: r.status, responseTime: r.responseTime, lastChecked: now, isNewlyDetected: false }
            : t;
        })
      );
    } catch (error) {
      console.error('Failed to check targets:', error);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  // Periodic check loop
  useEffect(() => {
    if (monitoredTargets.length === 0 || checkIntervalRef.current) return;
    checkAllTargets();
    checkIntervalRef.current = setInterval(() => checkAllTargets(), CHECK_INTERVAL);
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoredTargets.length > 0]);

  return {
    monitoredTargets,
    isChecking,
    addSwissTargets,
    checkAllTargets,
    newTargetsCount: monitoredTargets.filter((t) => t.isNewlyDetected).length,
  };
}
