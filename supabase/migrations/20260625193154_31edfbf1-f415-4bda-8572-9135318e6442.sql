CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _workspace_id UUID;
  _is_first_user BOOLEAN;
  _ws_name TEXT;
  _invited_ws TEXT;
BEGIN
  -- Profile
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1))
  )
  ON CONFLICT (id) DO NOTHING;

  -- First user check (before inserting role)
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO _is_first_user;

  -- Default app role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_first_user THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
  ON CONFLICT DO NOTHING;

  -- If this user was invited into an existing workspace, do NOT create a
  -- personal workspace. The invite flow handles their membership separately.
  _invited_ws := NEW.raw_user_meta_data->>'invited_to_workspace';
  IF _invited_ws IS NOT NULL AND length(_invited_ws) > 0 THEN
    RETURN NEW;
  END IF;

  -- Create personal workspace
  _ws_name := COALESCE(NEW.raw_user_meta_data->>'workspace_name', split_part(NEW.email,'@',1) || '''s Workspace');
  INSERT INTO public.workspaces (name, created_by)
  VALUES (_ws_name, NEW.id)
  RETURNING id INTO _workspace_id;

  -- Owner membership
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_workspace_id, NEW.id, 'owner');

  -- If first user: assign all existing orphaned seed data to this workspace
  IF _is_first_user THEN
    UPDATE public.clients      SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.campaigns    SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.reports      SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.onboarding   SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.leads        SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
    UPDATE public.activity_log SET workspace_id = _workspace_id WHERE workspace_id IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;