export interface Target {
  host: string;
  ip: string;
  type: string;
  method: string;
  port: number;
  use_ssl: boolean;
}

export interface TargetWithStatus extends Target {
  status: 'online' | 'offline' | 'warning' | 'unknown';
  responseTime?: number;
  lastChecked: Date;
  category: string;
}

export type StatusFilter = 'all' | 'online' | 'offline' | 'warning';

export interface CategoryStats {
  name: string;
  total: number;
  online: number;
  offline: number;
  warning: number;
}
