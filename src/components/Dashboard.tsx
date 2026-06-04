import { useTargets } from '@/hooks/useTargets';
import { Header } from './Header';
import { StatCard } from './StatCard';
import { TargetCard } from './TargetCard';
import { SearchFilter } from './SearchFilter';
import { CategoryChart } from './CategoryChart';
import { LatestTargetsPanel } from './LatestTargetsPanel';
import { AnomalyFeed } from './AnomalyFeed';
import { Activity, CheckCircle, AlertTriangle, XCircle, Timer } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function Dashboard() {
  const {
    targets,
    allTargets,
    loading,
    error,
    stats,
    categoryStats,
    categories,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    refreshStatus,
    isChecking,
    checkProgress,
  } = useTargets();

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold">Failed to load targets</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header 
        onRefresh={refreshStatus} 
        lastUpdated={allTargets[0]?.lastChecked}
        isChecking={isChecking}
        checkProgress={checkProgress}
      />

      <main className="container py-6 space-y-8">
        {/* Swiss Target Scanner - Prominent Center Section */}
        <section className="space-y-4">
          <LatestTargetsPanel />
        </section>

        {/* DDoS Anomaly Feed */}
        <section>
          <AnomalyFeed />
        </section>


        {/* Monitored Endpoints Section */}
        <section className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-4 text-muted-foreground font-medium">
                Monitored Endpoints
              </span>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground max-w-2xl mx-auto">
            Historische Übersicht aller jemals von NoName057(16) angegriffenen Schweizer Ziele. 
            Der Status zeigt die aktuelle Erreichbarkeit der Infrastruktur.
          </p>
        </section>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Targets"
            value={loading ? '-' : stats.total}
            icon={<Activity className="h-5 w-5" />}
            subtitle="Monitored endpoints"
          />
          <StatCard
            title="Online"
            value={loading ? '-' : stats.online}
            icon={<CheckCircle className="h-5 w-5" />}
            variant="success"
            subtitle={loading ? '-' : `${((stats.online / stats.total) * 100).toFixed(1)}%`}
          />
          <StatCard
            title="Degraded"
            value={loading ? '-' : stats.warning}
            icon={<AlertTriangle className="h-5 w-5" />}
            variant="warning"
            subtitle="Performance issues"
          />
          <StatCard
            title="Offline"
            value={loading ? '-' : stats.offline}
            icon={<XCircle className="h-5 w-5" />}
            variant="danger"
            subtitle="Unreachable"
          />
          <StatCard
            title="Avg Response"
            value={loading ? '-' : `${stats.avgResponseTime.toFixed(0)}ms`}
            icon={<Timer className="h-5 w-5" />}
            subtitle="Response time"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <div className="grid lg:grid-cols-[1fr_280px] gap-6">
          {/* Main Content */}
          <div className="space-y-4">
            <SearchFilter
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              categoryFilter={categoryFilter}
              onCategoryChange={setCategoryFilter}
              categories={categories}
              resultCount={targets.length}
            />

            {/* Target Grid */}
            {loading ? (
              <div className="grid md:grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {targets.map((target, index) => (
                  <div
                    key={`${target.host}-${target.method}-${index}`}
                    className="animate-fade-in"
                    style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                  >
                    <TargetCard target={target} />
                  </div>
                ))}
              </div>
            )}

            {!loading && targets.length === 0 && (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No targets match your filters</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="rounded-xl border bg-card p-4 shadow-card">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6" />
                  ))}
                </div>
              ) : (
                <CategoryChart stats={categoryStats} />
              )}
            </div>

            {/* Legend */}
            <div className="rounded-xl border bg-card p-4 shadow-card space-y-3">
              <h3 className="text-sm font-semibold">Status Legend</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-status-online" />
                  <span className="text-muted-foreground">Online - Responding normally</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-status-warning" />
                  <span className="text-muted-foreground">Degraded - Slow response</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-status-offline" />
                  <span className="text-muted-foreground">Offline - Not reachable</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 mt-12">
        <div className="container text-center text-sm text-muted-foreground">
          <p>SwissMon — Swiss Infrastructure Monitor</p>
          <p className="text-xs mt-1">
            Monitoring {stats.total} Swiss endpoints
          </p>
        </div>
      </footer>
    </div>
  );
}
