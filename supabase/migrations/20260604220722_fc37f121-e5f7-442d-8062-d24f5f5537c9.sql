-- Track which Swiss hosts have already triggered notifications (server-side dedup)
CREATE TABLE public.notified_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL UNIQUE,
  first_notified_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  notification_count integer NOT NULL DEFAULT 1,
  is_admin boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_notified_hosts_host ON public.notified_hosts (host);
CREATE INDEX idx_notified_hosts_last_seen ON public.notified_hosts (last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notified_hosts TO authenticated;
GRANT SELECT ON public.notified_hosts TO anon;
GRANT ALL ON public.notified_hosts TO service_role;

ALTER TABLE public.notified_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON public.notified_hosts FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.notified_hosts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.notified_hosts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON public.notified_hosts FOR DELETE USING (true);