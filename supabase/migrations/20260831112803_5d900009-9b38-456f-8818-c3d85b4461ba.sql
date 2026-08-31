REVOKE EXECUTE ON FUNCTION public.cleanup_expired_audit_artifacts_db() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_audit_artifacts_db() TO postgres;