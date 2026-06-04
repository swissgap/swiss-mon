import { useMemo } from 'react';
import { useTargetMetrics, type TargetMetric } from '@/hooks/useTargetMetrics';
import { Shield, AlertTriangle, Activity, Clock, Lock, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

function severityClasses(sev: TargetMetric['severity']) {
  switch (sev) {
    case 'alert':
      return 'border-status-offline/40 bg-status-offline/5';
    case 'warning':
      return 'border-status-warning/40 bg-status-warning/5';
    default:
      return 'border-status-online/20 bg-status-online/5';
  }
}

function severityIcon(sev: TargetMetric['severity']) {
  if (sev === 'alert') return <AlertTriangle className="h-4 w-4 text-status-offline" />;
  if (sev === 'warning') return <Activity className="h-4 w-4 text-status-warning" />;
  return <Shield className="h-4 w-4 text-status-online" />;
}

export function AnomalyFeed() {
  const { metrics, loading } = useTargetMetrics(60);

  // Latest metric per host
  const latestPerHost = useMemo(() => {
    const map = new Map<string, TargetMetric>();
    for (const m of metrics) if (!map.has(m.host)) map.set(m.host, m);
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }, [metrics]);

  const alerts = latestPerHost.filter((m) => m.severity !== 'ok').slice(0, 8);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">DDoS Anomaly Feed</h2>
        </div>
        <Badge variant="outline" className="text-xs">
          {latestPerHost.length} hosts · {alerts.length} anomal
        </Badge>
      </header>

      <p className="text-xs text-muted-foreground -mt-2">
        Erweiterte Netzwerkprüfung: Latenz-Drift, TLS-Handshake-Zeit, CDN/WAF-Fingerprint und
        DNS-Konsens über mehrere Resolver. Score ≥ 31 = Warnung, ≥ 61 = Alert.
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Keine Anomalien erkannt. Alle geprüften Hosts liegen im Normalbereich.
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((m) => (
            <div
              key={m.id}
              className={cn('rounded-lg border p-3 space-y-2', severityClasses(m.severity))}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {severityIcon(m.severity)}
                  <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="font-mono text-sm truncate">{m.host}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge
                    variant={m.severity === 'alert' ? 'destructive' : 'secondary'}
                    className="text-xs font-mono"
                  >
                    Score {m.score}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> p95 {m.p95_ms ?? '–'}ms
                </span>
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" /> jitter {m.jitter_ms ?? '–'}ms
                </span>
                <span className="flex items-center gap-1">
                  <Lock className="h-3 w-3" /> TLS {m.tls_ms ?? '–'}ms
                </span>
                <span className="flex items-center gap-1">
                  DNS {m.dns_consensus === false ? '⚠︎' : '✓'}
                </span>
              </div>
              {m.fingerprint && m.fingerprint !== 'none' && (
                <div className="text-[10px] font-mono text-muted-foreground/70 truncate">
                  {m.fingerprint}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
