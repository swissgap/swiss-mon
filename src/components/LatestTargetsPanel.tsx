import { useState, useEffect, useCallback } from 'react';
import { Radar, RefreshCw, ExternalLink, Globe, Wifi, WifiOff, ShieldCheck, Flag, Download, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { TeamsNotificationConfig } from './TeamsNotificationConfig';
import { exportTargetsToCSV, formatTimestamp } from '@/lib/csvExport';
import { useMonitoredTargets } from '@/hooks/useMonitoredTargets';

interface LatestTarget {
  target_id: string;
  request_id: string;
  host: string;
  ip: string;
  type: string;
  method: string;
  port: number;
  use_ssl: boolean;
  path?: string;
  is_swiss: boolean;
  is_admin: boolean;
  status?: 'online' | 'offline' | 'warning' | 'unknown';
  lastChecked?: Date;
}

interface ScanStats {
  total_requests: number;
  total_hosts: number;
  swiss_requests: number;
  swiss_hosts: number;
  admin_requests: number;
  admin_hosts: number;
}

interface LatestTargetsResponse {
  targets: LatestTarget[];
  swiss_targets: LatestTarget[];
  other_targets: LatestTarget[];
  stats: ScanStats;
  fetched_at: string;
}

// Status indicator component
function StatusBadge({ status }: { status?: 'online' | 'offline' | 'warning' | 'unknown' }) {
  if (!status || status === 'unknown') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          </TooltipTrigger>
          <TooltipContent>Status unbekannt</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  const config = {
    online: { color: 'bg-status-online', icon: CheckCircle, label: 'Online' },
    offline: { color: 'bg-status-offline', icon: XCircle, label: 'Offline' },
    warning: { color: 'bg-status-warning', icon: AlertTriangle, label: 'Degraded' },
  };
  
  const { color, label } = config[status];
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={cn("w-2 h-2 rounded-full animate-pulse", color)} />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function LatestTargetsPanel() {
  const [data, setData] = useState<LatestTargetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'swiss' | 'all'>('swiss');

  const { monitoredTargets, addSwissTargets, isChecking: isMonitorChecking } = useMonitoredTargets();

  const fetchLatestTargets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: responseData, error: fetchError } = await supabase.functions.invoke('fetch-latest-targets');
      
      if (fetchError) {
        throw new Error(fetchError.message);
      }
      
      setData(responseData);
      setLastFetched(new Date());
      
      // Auto-add Swiss targets to monitoring
      if (responseData?.swiss_targets?.length > 0) {
        const swissTargetsForMonitoring = responseData.swiss_targets.map((t: LatestTarget) => ({
          host: t.host,
          ip: t.ip,
          type: t.type,
          method: t.method,
          port: t.port,
          use_ssl: t.use_ssl,
          is_admin: t.is_admin,
          first_seen: responseData.fetched_at,
        }));
        addSwissTargets(swissTargetsForMonitoring);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch data');
    } finally {
      setLoading(false);
    }
  }, [addSwissTargets]);

  useEffect(() => {
    fetchLatestTargets();
  }, [fetchLatestTargets]);

  // Handle CSV export
  const handleExport = useCallback(() => {
    const targetsToExport = activeTab === 'swiss' ? data?.swiss_targets : data?.targets;
    if (!targetsToExport?.length) return;
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `swiss_targets_${timestamp}.csv`;
    exportTargetsToCSV(targetsToExport, filename);
  }, [activeTab, data]);

  const targets = activeTab === 'swiss' ? (data?.swiss_targets || []) : (data?.targets || []);
  const stats = data?.stats;

  // Merge with monitored targets to get real status
  const targetsWithStatus = targets.map(target => {
    const monitored = monitoredTargets.find(m => m.host.toLowerCase() === target.host.toLowerCase());
    return {
      ...target,
      status: monitored?.status,
      lastChecked: monitored?.lastChecked,
    };
  });

  // Group targets by host for cleaner display
  const groupedTargets = targetsWithStatus.reduce((acc, target) => {
    if (!acc[target.host]) {
      acc[target.host] = [];
    }
    acc[target.host].push(target);
    return acc;
  }, {} as Record<string, (LatestTarget & { status?: 'online' | 'offline' | 'warning' | 'unknown'; lastChecked?: Date })[]>);

  const uniqueHosts = Object.keys(groupedTargets);

  return (
    <div className="rounded-xl border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radar className="h-5 w-5 text-primary" />
            {loading && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-ping" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm">Swiss Target Scanner</h3>
            <p className="text-xs text-muted-foreground">
              Scanning *.ch & admin.ch targets
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TeamsNotificationConfig
            swissTargets={data?.swiss_targets?.map(t => ({
              host: t.host,
              ip: t.ip,
              type: t.type,
              method: t.method,
              port: t.port,
              use_ssl: t.use_ssl,
              is_admin: t.is_admin,
            })) || []}
            stats={stats ? {
              swiss_hosts: stats.swiss_hosts,
              admin_hosts: stats.admin_hosts,
              total_requests: stats.swiss_requests,
            } : undefined}
          />
          {/* CSV Export Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExport}
                  disabled={!data?.targets?.length}
                  className="h-8 w-8"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>CSV Export</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8"
          >
            <span className="text-xs">{isExpanded ? '−' : '+'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLatestTargets}
            disabled={loading}
            className="gap-1"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            <span className="hidden sm:inline">Scan</span>
          </Button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Timestamp Banner */}
          {lastFetched && (
            <div className="px-4 py-2 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Letzter Angriff erkannt: <strong className="text-foreground">{formatTimestamp(lastFetched)}</strong></span>
              </div>
              {isMonitorChecking && (
                <Badge variant="outline" className="text-[10px] animate-pulse">
                  Prüfe Status...
                </Badge>
              )}
            </div>
          )}

          {/* Swiss Stats Banner */}
          {stats && stats.swiss_hosts > 0 && (
            <div className="px-4 py-3 border-b bg-gradient-to-r from-red-500/10 via-white/5 to-red-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Flag className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                      {stats.swiss_hosts} Swiss Hosts
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    ({stats.swiss_requests} requests)
                  </span>
                  {monitoredTargets.length > 0 && (
                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                      {monitoredTargets.length} überwacht
                    </Badge>
                  )}
                </div>
                {stats.admin_hosts > 0 && (
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      {stats.admin_hosts} admin.ch
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'swiss' | 'all')} className="w-full">
            <div className="px-4 py-2 border-b bg-muted/10">
              <TabsList className="h-8 w-full grid grid-cols-2">
                <TabsTrigger value="swiss" className="text-xs gap-1.5">
                  <Flag className="h-3 w-3" />
                  Swiss Only ({stats?.swiss_hosts || 0})
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs gap-1.5">
                  <Globe className="h-3 w-3" />
                  All Targets ({stats?.total_hosts || 0})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Stats bar */}
            <div className="px-4 py-2 border-b bg-muted/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{targets.length}</strong> requests
                </span>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{uniqueHosts.length}</strong> hosts
                </span>
              </div>
              {lastFetched && (
                <span className="text-muted-foreground">
                  {lastFetched.toLocaleTimeString('de-CH')}
                </span>
              )}
            </div>

            {/* Content */}
            <TabsContent value={activeTab} className="mt-0">
              {error ? (
                <div className="p-4 text-center text-sm text-destructive">
                  <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{error}</p>
                  <Button 
                    variant="link" 
                    size="sm" 
                    onClick={fetchLatestTargets}
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              ) : loading && !data ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : uniqueHosts.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Flag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No {activeTab === 'swiss' ? 'Swiss (.ch)' : ''} targets found</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="p-2 space-y-1">
                    {uniqueHosts.slice(0, 50).map((host) => {
                      const hostTargets = groupedTargets[host];
                      const firstTarget = hostTargets[0];
                      const methods = [...new Set(hostTargets.map(t => t.method))];
                      const types = [...new Set(hostTargets.map(t => t.type))];
                      const isAdmin = hostTargets.some(t => t.is_admin);

                      return (
                        <div
                          key={`${host}-${firstTarget.target_id}`}
                          className={cn(
                            "group flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors",
                            isAdmin && "bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20"
                          )}
                        >
                          {/* Status Indicator */}
                          <StatusBadge status={firstTarget.status} />

                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                            isAdmin 
                              ? "bg-amber-500/10 text-amber-500"
                              : firstTarget.is_swiss
                                ? "bg-red-500/10 text-red-500"
                                : firstTarget.use_ssl 
                                  ? "bg-status-online/10 text-status-online" 
                                  : "bg-status-warning/10 text-status-warning"
                          )}>
                            {isAdmin ? (
                              <ShieldCheck className="h-4 w-4" />
                            ) : firstTarget.is_swiss ? (
                              <Flag className="h-4 w-4" />
                            ) : firstTarget.use_ssl ? (
                              <Wifi className="h-4 w-4" />
                            ) : (
                              <Globe className="h-4 w-4" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-sm font-medium truncate",
                                isAdmin && "text-amber-600 dark:text-amber-400",
                                firstTarget.is_swiss && !isAdmin && "text-red-600 dark:text-red-400"
                              )}>
                                {host.replace(/^www\./, '')}
                              </span>
                              {firstTarget.is_swiss && (
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-[9px] px-1 py-0",
                                    isAdmin 
                                      ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                      : "bg-red-500/10 text-red-600 border-red-500/30"
                                  )}
                                >
                                  {isAdmin ? 'ADMIN.CH' : '.CH'}
                                </Badge>
                              )}
                              <a
                                href={`${firstTarget.use_ssl ? 'https' : 'http'}://${host}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                              </a>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono">{firstTarget.ip || 'N/A'}</span>
                              <span>•</span>
                              <span>:{firstTarget.port}</span>
                              {firstTarget.lastChecked && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatTimestamp(firstTarget.lastChecked)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            {types.map(type => (
                              <Badge 
                                key={type} 
                                variant="outline" 
                                className="text-[10px] px-1.5 py-0"
                              >
                                {type.toUpperCase()}
                              </Badge>
                            ))}
                            {methods.map(method => (
                              <Badge 
                                key={method} 
                                variant="secondary" 
                                className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  method === 'POST' && "bg-amber-500/10 text-amber-600 border-amber-500/20",
                                  method === 'GET' && "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                )}
                              >
                                {method}
                              </Badge>
                            ))}
                            {hostTargets.length > 1 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{hostTargets.length - 1}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {uniqueHosts.length > 50 && (
                      <div className="text-center py-2 text-xs text-muted-foreground">
                        +{uniqueHosts.length - 50} more hosts
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
