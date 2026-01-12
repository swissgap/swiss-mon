import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StatusFilter } from '@/types/target';

interface SearchFilterProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  categoryFilter: string;
  onCategoryChange: (value: string) => void;
  categories: string[];
  resultCount: number;
}

export function SearchFilter({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  categories,
  resultCount,
}: SearchFilterProps) {
  const statusOptions: { value: StatusFilter; label: string; color?: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'online', label: 'Online', color: 'bg-status-online' },
    { value: 'warning', label: 'Degraded', color: 'bg-status-warning' },
    { value: 'offline', label: 'Offline', color: 'bg-status-offline' },
  ];

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search hosts, IPs, categories..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 bg-card"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status Filter */}
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {statusOptions.map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              onClick={() => onStatusChange(option.value)}
              className={cn(
                'h-8 px-3 gap-1.5 text-xs font-medium transition-all',
                statusFilter === option.value && 'bg-secondary shadow-sm'
              )}
            >
              {option.color && (
                <span className={cn('w-2 h-2 rounded-full', option.color)} />
              )}
              {option.label}
            </Button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="h-8 rounded-md border bg-card px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>

        {/* Result count */}
        <span className="text-sm text-muted-foreground ml-auto">
          {resultCount} targets
        </span>
      </div>
    </div>
  );
}
