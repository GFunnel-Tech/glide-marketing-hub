-- =============================================================================
-- Demo Account seed
-- =============================================================================
-- Creates a self-contained "Demo Account" workspace populated with a small set
-- of fake clients, campaigns and leads (across every channel) so the app looks
-- alive for demos. Safe to run repeatedly — it wipes and re-creates only the
-- demo workspace's data, never touching real workspaces.
--
-- HOW TO RUN
--   Supabase Dashboard > SQL Editor > paste this file > Run.
--   (or: psql "$DATABASE_URL" -f supabase/seed/demo_account.sql)
--
-- REQUIREMENT
--   The user identified by v_demo_email below must already exist in auth.users
--   (i.e. they've signed up once). The demo workspace is attached to that user
--   so it shows up under their account. Change the email to whoever should own
--   the demo, then run.
-- =============================================================================

DO $$
DECLARE
  -- >>> change this to the account that should own the demo workspace <<<
  v_demo_email text := 'admin@gfunnel.com';

  v_user_id  uuid;
  v_ws       uuid;
  v_conn     uuid;
  v_acct     uuid;
  c1 int; c2 int; c3 int; c4 int; c5 int;
BEGIN
  ---------------------------------------------------------------------------
  -- 0. Resolve the owning auth user
  ---------------------------------------------------------------------------
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_demo_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth user found for %. Sign that account up first, or edit v_demo_email.', v_demo_email;
  END IF;

  ---------------------------------------------------------------------------
  -- 1. Workspace (idempotent on slug) + clean slate
  ---------------------------------------------------------------------------
  SELECT id INTO v_ws FROM public.workspaces WHERE slug = 'demo-account' LIMIT 1;

  IF v_ws IS NOT NULL THEN
    -- Wipe child rows that aren't covered by FK cascade (channel leads &
    -- scores reference workspace_id without a foreign key).
    DELETE FROM public.google_leads   WHERE workspace_id = v_ws;
    DELETE FROM public.tiktok_leads   WHERE workspace_id = v_ws;
    DELETE FROM public.linkedin_leads WHERE workspace_id = v_ws;
    DELETE FROM public.manual_leads   WHERE workspace_id = v_ws;
    DELETE FROM public.meta_leads     WHERE workspace_id = v_ws;
    DELETE FROM public.lead_scores    WHERE workspace_id = v_ws;
    -- Cascades: clients -> campaigns/leads, connection -> ad_accounts.
    DELETE FROM public.clients          WHERE workspace_id = v_ws;
    DELETE FROM public.meta_ad_accounts WHERE workspace_id = v_ws;
    DELETE FROM public.meta_connections WHERE workspace_id = v_ws;
  ELSE
    INSERT INTO public.workspaces (name, slug, created_by)
    VALUES ('Demo Account', 'demo-account', v_user_id)
    RETURNING id INTO v_ws;
  END IF;

  -- Ensure the user owns the workspace
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws, v_user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';

  ---------------------------------------------------------------------------
  -- 2. Clients (5 fake brands)
  ---------------------------------------------------------------------------
  INSERT INTO public.clients (workspace_id, name, brand, status, bm_type, cpl, cpm, leads, spend, form_cvr, frequency, plai_connected, true_cpl, reported_leads, true_leads, last_audit)
  VALUES (v_ws, 'Summit Dental Co',        'Summit Dental',  'GREEN',  'Agency BM', 18.40,  9.20, 142, 2612.80, 31.5, 1.8, true,  21.10, 142, 124, '2026-06-15')
  RETURNING id INTO c1;

  INSERT INTO public.clients (workspace_id, name, brand, status, bm_type, cpl, cpm, leads, spend, form_cvr, frequency, plai_connected, true_cpl, reported_leads, true_leads, last_audit)
  VALUES (v_ws, 'Harbor Law Group',        'Harbor Law',     'YELLOW', 'Own BM',    44.75, 14.60,  61, 2729.75, 18.2, 2.6, true,  52.30,  61,  52, '2026-06-12')
  RETURNING id INTO c2;

  INSERT INTO public.clients (workspace_id, name, brand, status, bm_type, cpl, cpm, leads, spend, form_cvr, frequency, plai_connected, true_cpl, reported_leads, true_leads, last_audit)
  VALUES (v_ws, 'Peak Fitness Studios',    'Peak Fitness',   'GREEN',  'Agency BM',  9.85,  7.40, 308, 3033.80, 42.0, 1.4, true,  10.90, 308, 279, '2026-06-18')
  RETURNING id INTO c3;

  INSERT INTO public.clients (workspace_id, name, brand, status, bm_type, cpl, cpm, leads, spend, form_cvr, frequency, plai_connected, double_count, true_cpl, reported_leads, true_leads, last_audit)
  VALUES (v_ws, 'Bright Smile Orthodontics','Bright Smile',  'RED',    'Agency BM', 67.20, 19.80,  24, 1612.80, 11.4, 3.9, false, true, 88.40, 24, 18, '2026-05-30')
  RETURNING id INTO c4;

  INSERT INTO public.clients (workspace_id, name, brand, status, bm_type, cpl, cpm, leads, spend, form_cvr, frequency, plai_connected, true_cpl, reported_leads, true_leads, last_audit)
  VALUES (v_ws, 'Evergreen Roofing',       'Evergreen Roofing','GREEN','Own BM',    27.30, 11.10,  96, 2620.80, 24.8, 2.1, true,  29.60,  96,  90, '2026-06-17')
  RETURNING id INTO c5;

  ---------------------------------------------------------------------------
  -- 3. Campaigns (~2 per client)
  ---------------------------------------------------------------------------
  INSERT INTO public.campaigns (workspace_id, client_id, name, status, spend, leads, true_leads, cpl, true_cpl, cpm, frequency, ad_sets, ads, double_count)
  VALUES
    (v_ws, c1, 'Summit – New Patient LeadGen',  'active', 1840.00,  98,  88, 18.78, 20.91,  9.10, 1.7, 3,  9, false),
    (v_ws, c1, 'Summit – Implant Retargeting',  'active',  772.80,  44,  36, 17.56, 21.47,  9.40, 2.1, 2,  4, false),
    (v_ws, c2, 'Harbor – Personal Injury Intake','active',1729.75,  38,  33, 45.52, 52.42, 14.80, 2.5, 2,  6, false),
    (v_ws, c2, 'Harbor – Family Law',           'paused', 1000.00,  23,  19, 43.48, 52.63, 14.20, 2.8, 1,  3, false),
    (v_ws, c3, 'Peak – 7-Day Free Trial',       'active', 2033.80, 214, 196,  9.50, 10.38,  7.20, 1.3, 4, 12, false),
    (v_ws, c3, 'Peak – Personal Training Upsell','active',1000.00,  94,  83, 10.64, 12.05,  7.80, 1.6, 2,  5, false),
    (v_ws, c4, 'Bright Smile – Free Consult',   'active', 1612.80,  24,  18, 67.20, 89.60, 19.80, 3.9, 2,  5, true),
    (v_ws, c5, 'Evergreen – Storm Damage',      'active', 1620.80,  61,  57, 26.57, 28.44, 11.40, 2.0, 3,  7, false),
    (v_ws, c5, 'Evergreen – Free Inspection',   'active', 1000.00,  35,  33, 28.57, 30.30, 10.70, 2.2, 2,  4, false);

  ---------------------------------------------------------------------------
  -- 4. Meta channel — needs a (fake) connection + ad account
  ---------------------------------------------------------------------------
  INSERT INTO public.meta_connections (workspace_id, connected_by, connection_type, meta_user_name, access_token, status, scopes)
  VALUES (v_ws, v_user_id, 'manual', 'Demo Meta User', 'DEMO-TOKEN-NOT-REAL', 'active', ARRAY['ads_read','leads_retrieval'])
  RETURNING id INTO v_conn;

  INSERT INTO public.meta_ad_accounts (workspace_id, connection_id, client_id, act_id, account_name, currency, timezone_name, business_name, account_status, is_active, last_synced_at)
  VALUES (v_ws, v_conn, c1, 'act_demo_0001', 'Demo Agency Ad Account', 'USD', 'America/New_York', 'Demo Agency', 1, true, now())
  RETURNING id INTO v_acct;

  INSERT INTO public.meta_leads (workspace_id, ad_account_id, client_id, lead_id, form_name, campaign_name, ad_name, full_name, email, phone, created_time, stage, field_data)
  VALUES
    (v_ws, v_acct, c1, 'demo-meta-1', 'New Patient Form', 'Summit – New Patient LeadGen', 'Smiling Family v2', 'Olivia Bennett', 'olivia.bennett@example.com', '+1-202-555-0118', now() - interval '2 days',  'converted',   '[{"name":"What service are you interested in?","values":["Teeth cleaning"]},{"name":"Preferred time?","values":["Mornings"]}]'),
    (v_ws, v_acct, c1, 'demo-meta-2', 'New Patient Form', 'Summit – New Patient LeadGen', 'Smiling Family v2', 'Marcus Reed',    'marcus.reed@example.com',    '+1-202-555-0143', now() - interval '4 days',  'in_progress', '[{"name":"What service are you interested in?","values":["Implants"]}]'),
    (v_ws, v_acct, c1, 'demo-meta-3', 'Implant Form',     'Summit – Implant Retargeting', 'Before/After',      'Priya Nair',     'priya.nair@example.com',     '+1-202-555-0177', now() - interval '5 days',  'intake',      '[{"name":"What service are you interested in?","values":["Implants"]}]'),
    (v_ws, v_acct, c1, 'demo-meta-4', 'New Patient Form', 'Summit – New Patient LeadGen', 'Smiling Family v2', 'Daniel Carter',  'daniel.carter@example.com',  '+1-202-555-0190', now() - interval '8 days',  'converted',   '[{"name":"Preferred time?","values":["Evenings"]}]'),
    (v_ws, v_acct, c1, 'demo-meta-5', 'Implant Form',     'Summit – Implant Retargeting', 'Before/After',      'Sofia Alvarez',  'sofia.alvarez@example.com',  '+1-202-555-0112', now() - interval '11 days', 'intake',      '[]'),
    (v_ws, v_acct, c1, 'demo-meta-6', 'New Patient Form', 'Summit – New Patient LeadGen', 'Smiling Family v2', 'James O''Brien',  'james.obrien@example.com',   '+1-202-555-0165', now() - interval '14 days', 'in_progress', '[{"name":"What service are you interested in?","values":["Whitening"]}]');

  ---------------------------------------------------------------------------
  -- 5. Other channels (google / tiktok / linkedin / manual)
  ---------------------------------------------------------------------------
  INSERT INTO public.google_leads (workspace_id, client_id, external_lead_id, campaign_name, ad_name, form_name, full_name, email, phone, created_time, stage, field_data)
  VALUES
    (v_ws, c2, 'demo-goog-1', 'Harbor – Personal Injury Intake', 'PI Search Ad', 'Case Eval', 'Rachel Kim',     'rachel.kim@example.com',     '+1-312-555-0101', now() - interval '1 day',   'in_progress', '[{"name":"Type of case?","values":["Car accident"]}]'),
    (v_ws, c2, 'demo-goog-2', 'Harbor – Personal Injury Intake', 'PI Search Ad', 'Case Eval', 'Tom Wallace',    'tom.wallace@example.com',    '+1-312-555-0124', now() - interval '3 days',  'intake',      '[{"name":"Type of case?","values":["Slip and fall"]}]'),
    (v_ws, c2, 'demo-goog-3', 'Harbor – Family Law',             'Family Search','Consult',   'Nina Patel',     'nina.patel@example.com',     '+1-312-555-0188', now() - interval '6 days',  'converted',   '[]'),
    (v_ws, c3, 'demo-goog-4', 'Peak – 7-Day Free Trial',         'Trial Search', 'Trial Form','Leo Martin',     'leo.martin@example.com',     '+1-415-555-0133', now() - interval '2 days',  'converted',   '[{"name":"Goal?","values":["Weight loss"]}]'),
    (v_ws, c3, 'demo-goog-5', 'Peak – 7-Day Free Trial',         'Trial Search', 'Trial Form','Emma Stone',     'emma.stone@example.com',     '+1-415-555-0156', now() - interval '7 days',  'intake',      '[{"name":"Goal?","values":["Strength"]}]'),
    (v_ws, c5, 'demo-goog-6', 'Evergreen – Free Inspection',     'Roofing Search','Inspect',  'Carlos Mendez',  'carlos.mendez@example.com',  '+1-503-555-0142', now() - interval '4 days',  'in_progress', '[{"name":"Roof age?","values":["15+ years"]}]');

  INSERT INTO public.tiktok_leads (workspace_id, client_id, external_lead_id, campaign_name, ad_name, form_name, full_name, email, phone, created_time, stage, field_data)
  VALUES
    (v_ws, c3, 'demo-tt-1', 'Peak – 7-Day Free Trial',      'UGC Trainer Clip', 'Trial Form', 'Maya Singh',   'maya.singh@example.com',   '+1-415-555-0171', now() - interval '1 day',  'intake',      '[{"name":"Goal?","values":["Tone up"]}]'),
    (v_ws, c3, 'demo-tt-2', 'Peak – Personal Training Upsell','PT Testimonial',  'PT Form',    'Jordan Lee',   'jordan.lee@example.com',   '+1-415-555-0199', now() - interval '5 days', 'in_progress', '[]'),
    (v_ws, c4, 'demo-tt-3', 'Bright Smile – Free Consult',  'Teen Smile Clip',  'Consult',    'Ava Thompson', 'ava.thompson@example.com', '+1-602-555-0117', now() - interval '3 days', 'intake',      '[{"name":"For whom?","values":["My teen"]}]'),
    (v_ws, c4, 'demo-tt-4', 'Bright Smile – Free Consult',  'Teen Smile Clip',  'Consult',    'Ethan Brooks', 'ethan.brooks@example.com', '+1-602-555-0128', now() - interval '9 days', 'converted',   '[]');

  INSERT INTO public.linkedin_leads (workspace_id, client_id, external_lead_id, campaign_name, ad_name, form_name, full_name, email, phone, created_time, stage, field_data)
  VALUES
    (v_ws, c2, 'demo-li-1', 'Harbor – Family Law',        'Professional Ad', 'Consult',  'Grace Hall',    'grace.hall@example.com',    '+1-312-555-0210', now() - interval '2 days',  'intake',      '[{"name":"Company size?","values":["Self"]}]'),
    (v_ws, c2, 'demo-li-2', 'Harbor – Personal Injury Intake','Pro Ad',      'Case Eval','Victor Cole',   'victor.cole@example.com',   '+1-312-555-0222', now() - interval '6 days',  'in_progress', '[]'),
    (v_ws, c5, 'demo-li-3', 'Evergreen – Storm Damage',   'Commercial Roof', 'Inspect',  'Helen Park',    'helen.park@example.com',    '+1-503-555-0233', now() - interval '4 days',  'converted',   '[{"name":"Property type?","values":["Commercial"]}]'),
    (v_ws, c5, 'demo-li-4', 'Evergreen – Storm Damage',   'Commercial Roof', 'Inspect',  'Raj Malhotra',  'raj.malhotra@example.com',  '+1-503-555-0244', now() - interval '12 days', 'intake',      '[]');

  INSERT INTO public.manual_leads (workspace_id, client_id, external_lead_id, campaign_name, full_name, email, phone, created_time, stage, note, field_data)
  VALUES
    (v_ws, c1, 'demo-man-1', 'Referral',        'Hannah White',  'hannah.white@example.com',  '+1-202-555-0301', now() - interval '1 day',  'intake',      'Walk-in referral from existing patient', '[]'),
    (v_ws, c3, 'demo-man-2', 'Front desk call', 'Oscar Diaz',    'oscar.diaz@example.com',    '+1-415-555-0302', now() - interval '3 days', 'in_progress', 'Called about membership pricing', '[]'),
    (v_ws, c4, 'demo-man-3', 'Event booth',     'Lily Chen',     'lily.chen@example.com',     '+1-602-555-0303', now() - interval '5 days', 'converted',   'Met at community health fair', '[]'),
    (v_ws, c5, 'demo-man-4', 'Inbound call',    'Frank Murphy',  'frank.murphy@example.com',  '+1-503-555-0304', now() - interval '7 days', 'intake',      'Storm damage, wants quote this week', '[]'),
    (v_ws, c2, 'demo-man-5', 'Referral',        'Diane Foster',  'diane.foster@example.com',  '+1-312-555-0305', now() - interval '9 days', 'in_progress', 'Referred by Rachel Kim', '[]');

  ---------------------------------------------------------------------------
  -- 6. Lead scores (skip tiktok — not a valid lead_source_type)
  ---------------------------------------------------------------------------
  INSERT INTO public.lead_scores (workspace_id, client_id, lead_id, lead_source, score, grade, outcome, breakdown)
  SELECT v_ws, client_id, lead_id, 'meta'::public.lead_source_type, s,
         (CASE WHEN s >= 80 THEN 'A' WHEN s >= 60 THEN 'B' WHEN s >= 40 THEN 'C' ELSE 'D' END)::public.lead_score_grade,
         (CASE stage WHEN 'converted' THEN 'closed_won' WHEN 'in_progress' THEN 'unknown' ELSE 'unknown' END)::public.lead_outcome,
         jsonb_build_object('intent', s, 'recency', LEAST(100, s + 10))
  FROM (SELECT lead_id, client_id, stage, 30 + (abs(hashtext(lead_id)) % 70) AS s FROM public.meta_leads WHERE workspace_id = v_ws) m;

  INSERT INTO public.lead_scores (workspace_id, client_id, lead_id, lead_source, score, grade, outcome, breakdown)
  SELECT v_ws, client_id, id::text, 'google'::public.lead_source_type, s,
         (CASE WHEN s >= 80 THEN 'A' WHEN s >= 60 THEN 'B' WHEN s >= 40 THEN 'C' ELSE 'D' END)::public.lead_score_grade,
         (CASE stage WHEN 'converted' THEN 'closed_won' ELSE 'unknown' END)::public.lead_outcome,
         jsonb_build_object('intent', s)
  FROM (SELECT id, client_id, stage, 30 + (abs(hashtext(id::text)) % 70) AS s FROM public.google_leads WHERE workspace_id = v_ws) g;

  INSERT INTO public.lead_scores (workspace_id, client_id, lead_id, lead_source, score, grade, outcome, breakdown)
  SELECT v_ws, client_id, id::text, 'linkedin'::public.lead_source_type, s,
         (CASE WHEN s >= 80 THEN 'A' WHEN s >= 60 THEN 'B' WHEN s >= 40 THEN 'C' ELSE 'D' END)::public.lead_score_grade,
         (CASE stage WHEN 'converted' THEN 'closed_won' ELSE 'unknown' END)::public.lead_outcome,
         jsonb_build_object('intent', s)
  FROM (SELECT id, client_id, stage, 30 + (abs(hashtext(id::text)) % 70) AS s FROM public.linkedin_leads WHERE workspace_id = v_ws) l;

  INSERT INTO public.lead_scores (workspace_id, client_id, lead_id, lead_source, score, grade, outcome, breakdown)
  SELECT v_ws, client_id, id::text, 'manual'::public.lead_source_type, s,
         (CASE WHEN s >= 80 THEN 'A' WHEN s >= 60 THEN 'B' WHEN s >= 40 THEN 'C' ELSE 'D' END)::public.lead_score_grade,
         (CASE stage WHEN 'converted' THEN 'closed_won' ELSE 'unknown' END)::public.lead_outcome,
         jsonb_build_object('intent', s)
  FROM (SELECT id, client_id, stage, 30 + (abs(hashtext(id::text)) % 70) AS s FROM public.manual_leads WHERE workspace_id = v_ws) mn;

  RAISE NOTICE 'Demo Account seeded: workspace=% owner=% (5 clients, 9 campaigns, 25 leads)', v_ws, v_demo_email;
END $$;
