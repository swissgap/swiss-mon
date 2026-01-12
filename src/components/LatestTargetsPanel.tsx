import { useState, useEffect, useCallback } from 'react';
import { Radar, RefreshCw, ExternalLink, Globe, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
}

interface LatestTargetsResponse {
  targets: LatestTarget[];
}

export function LatestTargetsPanel() {
  const [targets, setTargets] = useState<LatestTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const fetchLatestTargets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try multiple CORS proxies for reliability
      const targetUrl = 'https://witha.name/data/last.json';
      const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
      ];
      
      let data: LatestTargetsResponse | null = null;
      let lastError: Error | null = null;
      
      for (const proxyUrl of proxies) {
        try {
          const response = await fetch(proxyUrl, { 
            signal: AbortSignal.timeout(10000) 
          });
          if (response.ok) {
            data = await response.json();
            break;
          }
        } catch (e) {
          lastError = e instanceof Error ? e : new Error('Unknown error');
        }
      }
      
      if (!data) {
        throw lastError || new Error('All proxies failed');
      }
      
      setTargets(data.targets || []);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatestTargets();
  }, [fetchLatestTargets]);

  // Group targets by host for cleaner display
  const groupedTargets = targets.reduce((acc, target) => {
    if (!acc[target.host]) {
      acc[target.host] = [];
    }
    acc[target.host].push(target);
    return acc;
  }, {} as Record<string, LatestTarget[]>);

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
            <h3 className="font-semibold text-sm">Live Scan</h3>
            <p className="text-xs text-muted-foreground">
              Latest targets from witha.name
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          ) : loading && targets.length === 0 ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="p-2 space-y-1">
                {uniqueHosts.slice(0, 50).map((host) => {
                  const hostTargets = groupedTargets[host];
                  const firstTarget = hostTargets[0];
                  const methods = [...new Set(hostTargets.map(t => t.method))];
                  const types = [...new Set(hostTargets.map(t => t.type))];

                  return (
                    <div
                      key={`${host}-${firstTarget.target_id}`}
                      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className={cn(
                        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                        firstTarget.use_ssl 
                          ? "bg-status-online/10 text-status-online" 
                          : "bg-status-warning/10 text-status-warning"
                      )}>
                        {firstTarget.use_ssl ? (
                          <Wifi className="h-4 w-4" />
                        ) : (
                          <Globe className="h-4 w-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {host.replace(/^www\./, '')}
                          </span>
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
                          <span className="font-mono">{firstTarget.ip}</span>
                          <span>•</span>
                          <span>:{firstTarget.port}</span>
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
        </>
      )}
    </div>
  );
}
