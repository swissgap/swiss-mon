import { cn } from '@/lib/utils';

interface SwissFlagProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SwissFlag({ className, size = 'md' }: SwissFlagProps) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div
      className={cn(
        'relative bg-gradient-swiss rounded-sm flex items-center justify-center shadow-sm',
        sizeClasses[size],
        className
      )}
    >
      {/* Horizontal bar */}
      <div className="absolute w-[60%] h-[20%] bg-white rounded-[1px]" />
      {/* Vertical bar */}
      <div className="absolute w-[20%] h-[60%] bg-white rounded-[1px]" />
    </div>
  );
}
