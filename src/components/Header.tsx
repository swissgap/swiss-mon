import { SwissFlag } from './SwissFlag';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onRefresh: () => void;
  lastUpdated?: Date;
}

export function Header({ onRefresh, lastUpdated }: HeaderProps) {
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
          {lastUpdated && (
            <span className="hidden sm:block text-xs text-muted-foreground">
              Updated: {lastUpdated.toLocaleTimeString('de-CH')}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
