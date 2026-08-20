DELETE FROM public.client_media_assets WHERE client_id = 160;
UPDATE public.portal_onboarding
SET submitted_at = NULL, completed_at = NULL,
    images_done = false, voice_done = false, files_done = false, info_done = false,
    business_name = NULL, brand_display_name = NULL
WHERE client_id = 160;