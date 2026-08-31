CREATE OR REPLACE FUNCTION public.sync_audit_artifact_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_permanent THEN
    NEW.expires_at := NULL;
  ELSIF NEW.expires_at IS NULL OR TG_OP = 'INSERT' THEN
    NEW.expires_at := now() + interval '3 months';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_audit_artifact_expiry ON public.client_audit_artifacts;
CREATE TRIGGER sync_audit_artifact_expiry
  BEFORE INSERT OR UPDATE ON public.client_audit_artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_audit_artifact_expiry();