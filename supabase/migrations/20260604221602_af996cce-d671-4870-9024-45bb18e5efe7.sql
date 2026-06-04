DROP POLICY IF EXISTS "Service role write metrics" ON public.target_metrics;
REVOKE INSERT, UPDATE, DELETE ON public.target_metrics FROM anon, authenticated;