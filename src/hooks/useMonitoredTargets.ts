import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useMonitoredTargets() {
  const [monitoredTargets, setMonitoredTargets] = useState<MonitoredTarget[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load stored targets from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as MonitoredTarget[];
        setMonitoredTargets(parsed.map(t => ({
          ...t,
          firstSeen: new Date(t.firstSeen),
          lastAttacked: new Date(t.lastAttacked),
          lastChecked: new Date(t.lastChecked),
          isNewlyDetected: false,
        })));
      } catch (e) {
        console.error('Failed to parse stored targets:', e);
      }
    }
  }, []);

  // Save targets to localStorage when they change
  useEffect(() => {
    if (monitoredTargets.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(monitoredTargets));
    }
  }, [monitoredTargets]);

  // Add new Swiss targets to monitoring
  const addSwissTargets = useCallback((swissTargets: SwissTarget[]) => {
    const now = new Date();
    const newTargets: MonitoredTarget[] = [];
    
    setMonitoredTargets(current => {
      const existingHosts = new Set(current.map(t => t.host.toLowerCase()));
      
      for (const target of swissTargets) {
        const hostLower = target.host.toLowerCase();
        
        if (!existingHosts.has(hostLower)) {
          existingHosts.add(hostLower);
          newTargets.push({
            host: target.host,
            ip: target.ip,
            type: target.type,
            method: target.method,
            port: target.port,
            use_ssl: target.use_ssl,
            status: 'unknown',
            responseTime: undefined,
            lastChecked: now,
            category: detectCategory(target.host),
            firstSeen: target.first_seen ? new Date(target.first_seen) : now,
            lastAttacked: now,
            isNewlyDetected: true,
          });
        } else {
          // Update lastAttacked for existing targets
          const existingIndex = current.findIndex(t => t.host.toLowerCase() === hostLower);
          if (existingIndex !== -1) {
            current[existingIndex] = {
              ...current[existingIndex],
              lastAttacked: now,
            };
          }
        }
      }
      
      return [...current, ...newTargets];
    });
    
    return newTargets;
  }, []);

  // Check status of a single target
  const checkTargetStatus = useCallback(async (target: MonitoredTarget): Promise<MonitoredTarget> => {
    const protocol = target.use_ssl ? 'https' : 'http';
    const url = `${protocol}://${target.host}:${target.port}`;
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      
      let status: 'online' | 'offline' | 'warning' = 'online';
      if (responseTime > 3000) {
        status = 'warning';
      }
      
      return {
        ...target,
        status,
        responseTime,
        lastChecked: new Date(),
        isNewlyDetected: false,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // no-cors mode doesn't give us status, so if we got here without abort, assume online
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        return {
          ...target,
          status: 'online', // Assume online for no-cors requests
          responseTime,
          lastChecked: new Date(),
          isNewlyDetected: false,
        };
      }
      
      return {
        ...target,
        status: 'offline',
        responseTime: undefined,
        lastChecked: new Date(),
        isNewlyDetected: false,
      };
    }
  }, []);

  // Check all monitored targets
  const checkAllTargets = useCallback(async () => {
    if (isChecking || monitoredTargets.length === 0) return;
    
    setIsChecking(true);
    
    try {
      const checkedTargets = await Promise.all(
        monitoredTargets.map(target => checkTargetStatus(target))
      );
      setMonitoredTargets(checkedTargets);
    } catch (error) {
      console.error('Failed to check targets:', error);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, monitoredTargets, checkTargetStatus]);

  // Start periodic checking
  useEffect(() => {
    if (monitoredTargets.length > 0 && !checkIntervalRef.current) {
      // Initial check
      checkAllTargets();
      
      // Set up interval
      checkIntervalRef.current = setInterval(() => {
        checkAllTargets();
      }, CHECK_INTERVAL);
    }
    
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [monitoredTargets.length, checkAllTargets]);

  // Get targets merged with historical data
  const getMergedTargets = useCallback((historicalTargets: TargetWithStatus[]): TargetWithStatus[] => {
    const mergedMap = new Map<string, TargetWithStatus>();
    
    // Add historical targets first
    for (const target of historicalTargets) {
      mergedMap.set(target.host.toLowerCase(), target);
    }
    
    // Overlay monitored targets (with real status)
    for (const target of monitoredTargets) {
      const existing = mergedMap.get(target.host.toLowerCase());
      if (existing) {
        mergedMap.set(target.host.toLowerCase(), {
          ...existing,
          status: target.status !== 'unknown' ? target.status : existing.status,
          responseTime: target.responseTime ?? existing.responseTime,
          lastChecked: target.lastChecked,
        });
      } else {
        mergedMap.set(target.host.toLowerCase(), target);
      }
    }
    
    return Array.from(mergedMap.values());
  }, [monitoredTargets]);

  return {
    monitoredTargets,
    isChecking,
    addSwissTargets,
    checkAllTargets,
    getMergedTargets,
    newTargetsCount: monitoredTargets.filter(t => t.isNewlyDetected).length,
  };
}
