import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Target, TargetWithStatus, StatusFilter } from '@/types/target';
import { enrichTargets, calculateCategoryStats } from '@/lib/targetUtils';
import { useRealStatusCheck } from './useRealStatusCheck';

import { fetchMonitoredTargets } from './useMonitoredTargets';

export function useTargets() {
  const [targets, setTargets] = useState<TargetWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { isChecking, progress, checkAllTargets } = useRealStatusCheck();

  // Load targets from JSON file and merge with monitored targets
  useEffect(() => {
    async function loadTargets() {
      try {
        const response = await fetch('/data/swiss_targets.json');
        if (!response.ok) throw new Error('Failed to load targets');
        const data: Target[] = await response.json();
        const enrichedTargets = enrichTargets(data);
        
        // Merge with server-side monitored targets (status + newly attacked hosts)
        try {
          const monitored = await fetchMonitoredTargets();
          const byHost = new Map(enrichedTargets.map((t, i) => [t.host.toLowerCase(), i]));
          for (const mt of monitored) {
            const i = byHost.get(mt.host.toLowerCase());
            if (i === undefined) enrichedTargets.push(mt);
            else if (mt.status !== 'unknown') {
              enrichedTargets[i] = { ...enrichedTargets[i], status: mt.status, responseTime: mt.responseTime, lastChecked: mt.lastChecked };
            }
          }
        } catch (e) {
          console.error('Failed to load monitored targets:', e);
        }

        
        setTargets(enrichedTargets);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadTargets();
  }, []);

  // Update handler for real status checks
  const handleStatusUpdate = useCallback((updated: TargetWithStatus[]) => {
    setTargets(updated);
  }, []);

  // Trigger real status check
  const refreshStatus = useCallback(() => {
    if (!isChecking && targets.length > 0) {
      checkAllTargets(targets, handleStatusUpdate);
    }
  }, [targets, isChecking, checkAllTargets, handleStatusUpdate]);

  // Filter and sort targets
  const filteredTargets = useMemo(() => {
    const filtered = targets.filter(target => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          target.host.toLowerCase().includes(query) ||
          target.ip.toLowerCase().includes(query) ||
          target.category.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && target.status !== statusFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && target.category !== categoryFilter) {
        return false;
      }

      return true;
    });

    // Sort: offline -> warning -> online -> unknown
    const statusOrder: Record<string, number> = { offline: 0, warning: 1, online: 2, unknown: 3 };
    return filtered.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));
  }, [targets, searchQuery, statusFilter, categoryFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = targets.length;
    const online = targets.filter(t => t.status === 'online').length;
    const offline = targets.filter(t => t.status === 'offline').length;
    const warning = targets.filter(t => t.status === 'warning').length;
    const avgResponseTime = targets.reduce((acc, t) => acc + (t.responseTime || 0), 0) / total || 0;

    return { total, online, offline, warning, avgResponseTime };
  }, [targets]);

  // Category stats
  const categoryStats = useMemo(() => calculateCategoryStats(targets), [targets]);

  // Available categories
  const categories = useMemo(() => {
    const cats = new Set(targets.map(t => t.category));
    return ['all', ...Array.from(cats).sort()];
  }, [targets]);

  return {
    targets: filteredTargets,
    allTargets: targets,
    loading,
    error,
    stats,
    categoryStats,
    categories,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    refreshStatus,
    isChecking,
    checkProgress: progress,
  };
}
