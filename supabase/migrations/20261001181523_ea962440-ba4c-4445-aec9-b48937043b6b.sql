DROP POLICY IF EXISTS "Allow public delete access" ON public.notification_settings;
DROP POLICY IF EXISTS "Allow public insert access" ON public.notification_settings;
DROP POLICY IF EXISTS "Allow public read access" ON public.notification_settings;
DROP POLICY IF EXISTS "Allow public update access" ON public.notification_settings;
REVOKE ALL ON public.notification_settings FROM anon, authenticated;
GRANT ALL ON public.notification_settings TO service_role;

DROP POLICY IF EXISTS "Allow public delete access" ON public.notified_hosts;
DROP POLICY IF EXISTS "Allow public insert access" ON public.notified_hosts;
DROP POLICY IF EXISTS "Allow public update access" ON public.notified_hosts;
REVOKE INSERT, UPDATE, DELETE ON public.notified_hosts FROM anon, authenticated;
GRANT ALL ON public.notified_hosts TO service_role;

CREATE TABLE public.monitored_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL UNIQUE,
  ip text,
  type text,
  method text,
  port integer NOT NULL DEFAULT 443,
  use_ssl boolean NOT NULL DEFAULT true,
  is_admin boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_attacked timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'unknown',
  response_time integer,
  status_code integer,
  last_checked timestamptz
);
GRANT SELECT ON public.monitored_targets TO anon, authenticated;
GRANT ALL ON public.monitored_targets TO service_role;
ALTER TABLE public.monitored_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read monitored" ON public.monitored_targets FOR SELECT USING (true);

CREATE TABLE public.scan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  source text,
  payload jsonb NOT NULL
);
GRANT SELECT ON public.scan_snapshots TO anon, authenticated;
GRANT ALL ON public.scan_snapshots TO service_role;
ALTER TABLE public.scan_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read snapshots" ON public.scan_snapshots FOR SELECT USING (true);
CREATE INDEX scan_snapshots_fetched_idx ON public.scan_snapshots (fetched_at DESC);