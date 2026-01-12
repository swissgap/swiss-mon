import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning';
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon,
  variant = 'default',
  className 
}: StatCardProps) {
  const variantClasses = {
    default: 'border-border',
    success: 'border-status-online/30',
    danger: 'border-status-offline/30',
    warning: 'border-status-warning/30',
  };

  const iconVariantClasses = {
    default: 'text-muted-foreground bg-secondary',
    success: 'text-status-online bg-status-online/10',
    danger: 'text-status-offline bg-status-offline/10',
    warning: 'text-status-warning bg-status-warning/10',
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-5 shadow-card transition-all duration-300 hover:shadow-soft',
        variantClasses[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className={cn(
            'rounded-lg p-2.5',
            iconVariantClasses[variant]
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
