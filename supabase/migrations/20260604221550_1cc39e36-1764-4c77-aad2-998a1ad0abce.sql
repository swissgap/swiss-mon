
CREATE TABLE public.target_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  p50_ms integer,
  p95_ms integer,
  jitter_ms integer,
  tls_ms integer,
  status_code integer,
  fingerprint text,
  dns_consensus boolean,
  score integer NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'ok',
  details jsonb
);

CREATE INDEX idx_target_metrics_host_checked ON public.target_metrics(host, checked_at DESC);

GRANT SELECT ON public.target_metrics TO anon, authenticated;
GRANT ALL ON public.target_metrics TO service_role;

ALTER TABLE public.target_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read metrics" ON public.target_metrics FOR SELECT USING (true);
CREATE POLICY "Service role write metrics" ON public.target_metrics FOR INSERT WITH CHECK (true);
