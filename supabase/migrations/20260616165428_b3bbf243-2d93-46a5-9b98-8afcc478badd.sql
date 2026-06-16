CREATE OR REPLACE FUNCTION public.set_meta_lead_initial_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.next_check_at IS NULL THEN
    -- Give the native Meta → GHL bridge more time before flagging as missing
    NEW.next_check_at := now() + interval '15 minutes';
  END IF;
  IF NEW.sync_status IS NULL THEN
    NEW.sync_status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;