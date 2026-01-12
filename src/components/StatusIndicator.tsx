import { cn } from '@/lib/utils';
import { getStatusBgColor } from '@/lib/targetUtils';

interface StatusIndicatorProps {
  status: 'online' | 'offline' | 'warning' | 'unknown';
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

export function StatusIndicator({ 
  status, 
  size = 'md', 
  pulse = true,
  className 
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  return (
    <span className={cn('relative flex', className)}>
      {pulse && status !== 'unknown' && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            getStatusBgColor(status)
          )}
        />
      )}
      <span
        className={cn(
          'relative inline-flex rounded-full',
          sizeClasses[size],
          getStatusBgColor(status)
        )}
      />
    </span>
  );
}
