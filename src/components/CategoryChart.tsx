import type { CategoryStats } from '@/types/target';
import { cn } from '@/lib/utils';

interface CategoryChartProps {
  stats: CategoryStats[];
  className?: string;
}

export function CategoryChart({ stats, className }: CategoryChartProps) {
  const maxTotal = Math.max(...stats.map(s => s.total));

  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold text-foreground">Categories</h3>
      <div className="space-y-2">
        {stats.slice(0, 8).map((stat) => {
          const onlinePercent = (stat.online / stat.total) * 100;
          const warningPercent = (stat.warning / stat.total) * 100;
          const offlinePercent = (stat.offline / stat.total) * 100;
          const widthPercent = (stat.total / maxTotal) * 100;

          return (
            <div key={stat.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{stat.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {stat.online}/{stat.total}
                </span>
              </div>
              <div 
                className="h-2 rounded-full bg-secondary overflow-hidden"
                style={{ width: `${widthPercent}%` }}
              >
                <div className="h-full flex">
                  <div 
                    className="h-full bg-status-online transition-all duration-500"
                    style={{ width: `${onlinePercent}%` }}
                  />
                  <div 
                    className="h-full bg-status-warning transition-all duration-500"
                    style={{ width: `${warningPercent}%` }}
                  />
                  <div 
                    className="h-full bg-status-offline transition-all duration-500"
                    style={{ width: `${offlinePercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
