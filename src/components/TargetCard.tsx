import { cn } from '@/lib/utils';
import { StatusIndicator } from './StatusIndicator';
import { formatHost, getStatusColor } from '@/lib/targetUtils';
import type { TargetWithStatus } from '@/types/target';
import { Globe, Lock, Server, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TargetCardProps {
  target: TargetWithStatus;
  className?: string;
}

export function TargetCard({ target, className }: TargetCardProps) {
  const statusLabel = {
    online: 'Online',
    offline: 'Offline',
    warning: 'Degraded',
    unknown: 'Unknown',
  };

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card p-4 shadow-card transition-all duration-300 hover:shadow-soft hover:-translate-y-0.5',
        target.status === 'offline' && 'border-status-offline/20',
        target.status === 'warning' && 'border-status-warning/20',
        target.status === 'online' && 'border-status-online/10',
        className
      )}
    >
      {/* Status bar */}
      <div className={cn(
        'absolute left-0 top-0 h-full w-1 transition-all duration-300',
        target.status === 'online' && 'bg-status-online',
        target.status === 'offline' && 'bg-status-offline',
        target.status === 'warning' && 'bg-status-warning',
        target.status === 'unknown' && 'bg-status-unknown'
      )} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          {/* Host */}
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <a
              href={`https://${target.host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm font-medium truncate hover:text-primary transition-colors flex items-center gap-1 group/link"
            >
              {formatHost(target.host)}
              <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
            </a>
          </div>

          {/* IP & Port */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />
              <span className="font-mono">{target.ip}</span>
            </span>
            <span className="flex items-center gap-1.5">
              {target.use_ssl ? (
                <Lock className="h-3.5 w-3.5 text-status-online" />
              ) : (
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              <span>:{target.port}</span>
            </span>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs font-medium">
              {target.category}
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">
              {target.method}
            </Badge>
          </div>
        </div>

        {/* Status */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <StatusIndicator status={target.status} size="sm" pulse={target.status !== 'online'} />
            <span className={cn('text-sm font-medium', getStatusColor(target.status))}>
              {statusLabel[target.status]}
            </span>
          </div>
          {target.responseTime && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {target.responseTime}ms
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
