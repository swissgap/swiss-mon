import type { Target, TargetWithStatus, CategoryStats } from '@/types/target';

// Category detection based on hostname patterns
export function detectCategory(host: string): string {
  const lowerHost = host.toLowerCase();
  
  if (lowerHost.includes('admin.ch') || lowerHost.includes('parlament') || lowerHost.includes('fedpol') || lowerHost.includes('ejpd') || lowerHost.includes('bazg')) {
    return 'Government';
  }
  if (lowerHost.includes('sbb') || lowerHost.includes('post.ch') || lowerHost.includes('sob.ch') || lowerHost.includes('swisspass') || lowerHost.includes('bls.ch')) {
    return 'Transport';
  }
  if (lowerHost.includes('airport') || lowerHost.includes('flughafen') || lowerHost.includes('gva.ch') || lowerHost.includes('lugano-airport')) {
    return 'Aviation';
  }
  if (lowerHost.includes('bank') || lowerHost.includes('credit') || lowerHost.includes('ubs') || lowerHost.includes('zkb') || lowerHost.includes('finma')) {
    return 'Finance';
  }
  if (lowerHost.includes('spital') || lowerHost.includes('hospital') || lowerHost.includes('klinik') || lowerHost.includes('bag.admin')) {
    return 'Healthcare';
  }
  if (lowerHost.includes('stadt') || lowerHost.includes('.bs.ch') || lowerHost.includes('.be.ch') || lowerHost.includes('.zh.ch') || lowerHost.includes('.ge.ch')) {
    return 'Cantonal';
  }
  if (lowerHost.includes('vtg') || lowerHost.includes('armee') || lowerHost.includes('military') || lowerHost.includes('armasuisse')) {
    return 'Defense';
  }
  if (lowerHost.includes('swisscom') || lowerHost.includes('sunrise') || lowerHost.includes('salt.ch')) {
    return 'Telecom';
  }
  if (lowerHost.includes('energie') || lowerHost.includes('ewz') || lowerHost.includes('bkw') || lowerHost.includes('axpo')) {
    return 'Energy';
  }
  
  return 'Other';
}

// Enrich targets with default status (unknown) and category.
// Real status is populated later by the check-target-status edge function.
export function enrichTargets(targets: Target[]): TargetWithStatus[] {
  const seen = new Set<string>();
  const uniqueTargets = targets.filter((t) => {
    if (seen.has(t.host)) return false;
    seen.add(t.host);
    return true;
  });

  return uniqueTargets.map((target) => ({
    ...target,
    status: 'unknown' as const,
    responseTime: undefined,
    lastChecked: new Date(),
    category: detectCategory(target.host),
  }));
}

// Calculate category statistics
export function calculateCategoryStats(targets: TargetWithStatus[]): CategoryStats[] {
  const statsMap = new Map<string, CategoryStats>();

  targets.forEach(target => {
    const existing = statsMap.get(target.category) || {
      name: target.category,
      total: 0,
      online: 0,
      offline: 0,
      warning: 0,
    };

    existing.total++;
    if (target.status === 'online') existing.online++;
    if (target.status === 'offline') existing.offline++;
    if (target.status === 'warning') existing.warning++;

    statsMap.set(target.category, existing);
  });

  return Array.from(statsMap.values()).sort((a, b) => b.total - a.total);
}

// Format host display
export function formatHost(host: string): string {
  return host.replace(/^www\./, '');
}

// Get status color class
export function getStatusColor(status: string): string {
  switch (status) {
    case 'online': return 'text-status-online';
    case 'offline': return 'text-status-offline';
    case 'warning': return 'text-status-warning';
    default: return 'text-status-unknown';
  }
}

export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'online': return 'bg-status-online';
    case 'offline': return 'bg-status-offline';
    case 'warning': return 'bg-status-warning';
    default: return 'bg-status-unknown';
  }
}
