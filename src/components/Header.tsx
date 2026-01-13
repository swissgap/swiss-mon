import { SwissFlag } from './SwissFlag';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface HeaderProps {
  onRefresh: () => void;
  lastUpdated?: Date;
  isChecking?: boolean;
  checkProgress?: number;
}

export function Header({ onRefresh, lastUpdated, isChecking, checkProgress = 0 }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <SwissFlag size="md" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Swiss<span className="text-gradient-swiss">Mon</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Infrastructure Monitor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {isChecking && (
            <div className="hidden sm:flex items-center gap-2 min-w-[150px]">
              <Progress value={checkProgress} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {Math.round(checkProgress)}%
              </span>
            </div>
          )}
          {lastUpdated && !isChecking && (
            <span className="hidden sm:block text-xs text-muted-foreground">
              Updated: {lastUpdated.toLocaleTimeString('de-CH')}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isChecking}
            className="gap-2"
          >
            {isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isChecking ? 'Scanning...' : 'Check Status'}
            </span>
          </Button>
        </div>
      </div>
    </header>
  );
}
