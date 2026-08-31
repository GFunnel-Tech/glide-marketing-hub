CREATE OR REPLACE FUNCTION public.cleanup_expired_audit_artifacts_db()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.client_audit_artifacts
  WHERE is_permanent = false
    AND expires_at IS NOT NULL
    AND expires_at <= now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_audit_artifacts_db() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_audit_artifacts_db() TO postgres;