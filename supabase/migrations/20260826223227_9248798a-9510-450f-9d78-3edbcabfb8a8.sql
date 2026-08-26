create or replace function public.ghl_account_audit(_workspace_id uuid, _client_id integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _has_ws_key boolean;
  _rows jsonb;
begin
  if _uid is not null
     and not public.is_workspace_member(_uid, _workspace_id)
     and not public.is_super_admin(_uid) then
    raise exception 'Forbidden';
  end if;

  select coalesce(length(ghl_api_key) > 10, false) into _has_ws_key
  from public.integration_configs where workspace_id = _workspace_id limit 1;
  _has_ws_key := coalesce(_has_ws_key, false);

  with cl as (
    select c.id, c.name, c.status, c.ghl_location_id
    from public.clients c
    where c.workspace_id = _workspace_id
      and c.ghl_location_id is not null
      and (_client_id is null or c.id = _client_id)
  ),
  loc as (
    select l.location_id, l.name, l.business_name, l.last_synced_at,
           coalesce(length(l.location_api_key) > 10, false) as has_pit
    from public.ghl_locations l where l.workspace_id = _workspace_id
  ),
  st as (
    select s.* from public.ghl_sync_state s where s.workspace_id = _workspace_id
  ),
  ct as (
    select client_id,
           count(*) as contacts,
           count(*) filter (where coalesce(email,'') = '') as no_email,
           count(*) filter (where coalesce(phone,'') = '') as no_phone,
           count(*) filter (where tags is null or cardinality(tags) = 0) as no_tags,
           max(date_added) as newest_contact
    from public.ghl_contacts where workspace_id = _workspace_id group by 1
  ),
  nt as (
    select client_id, count(*) as notes, count(distinct contact_id) as contacts_with_notes,
           max(date_added) as newest_note
    from public.ghl_contact_notes where workspace_id = _workspace_id group by 1
  ),
  tk as (
    select client_id,
           count(*) filter (where not completed) as open_tasks,
           count(*) filter (where not completed and due_date < now()) as overdue_tasks
    from public.ghl_contact_tasks where workspace_id = _workspace_id group by 1
  ),
  pl as (
    select client_id, count(*) as pipelines from public.ghl_pipelines
    where workspace_id = _workspace_id group by 1
  ),
  op as (
    select client_id,
           count(*) as opportunities,
           count(*) filter (where lower(coalesce(status,'open')) = 'open') as open_opps,
           count(*) filter (where lower(coalesce(status,'open')) = 'open'
                              and coalesce(updated_at, created_at) < now() - interval '30 days') as stale_opps,
           coalesce(sum(monetary_value) filter (where lower(coalesce(status,'open')) = 'open'), 0) as open_value
    from public.ghl_opportunities where workspace_id = _workspace_id group by 1
  ),
  ap as (
    select client_id,
           count(*) filter (where start_time >= now()) as upcoming_appts,
           count(*) filter (where start_time >= now() - interval '60 days' and start_time < now()) as past_appts,
           count(*) filter (where start_time >= now() - interval '60 days'
                              and (lower(coalesce(status,'')) like '%noshow%'
                                or lower(coalesce(status,'')) like '%no_show%'
                                or lower(coalesce(outcome,'')) like '%noshow%')) as no_shows
    from public.ghl_appointments where workspace_id = _workspace_id group by 1
  ),
  ml as (
    select client_id,
           count(*) filter (where created_time >= now() - interval '30 days') as leads_30d,
           count(*) filter (where created_time >= now() - interval '30 days'
                              and ghl_contact_id is null) as leads_unpushed_30d,
           count(*) filter (where created_time >= now() - interval '30 days'
                              and coalesce(last_sync_error,'') <> '') as leads_sync_errors_30d
    from public.meta_leads where workspace_id = _workspace_id group by 1
  )
  select jsonb_agg(x order by x->>'clientName')
  into _rows
  from (
    select jsonb_build_object(
      'clientId', cl.id,
      'clientName', cl.name,
      'status', cl.status,
      'locationId', cl.ghl_location_id,
      'locationName', coalesce(loc.business_name, loc.name),
      'auth', jsonb_build_object(
        'hasToken', coalesce(loc.has_pit, false) or _has_ws_key,
        'tokenType', case when coalesce(loc.has_pit, false) then 'sub-account token'
                          when _has_ws_key then 'agency key' else 'none' end,
        'locationKnown', loc.location_id is not null,
        'lastLocationSyncAt', loc.last_synced_at,
        'lastRunAt', st.last_run_at,
        'lastContactsSyncAt', st.last_contacts_sync_at,
        'lastApptsSyncAt', st.last_appts_sync_at,
        'lastError', st.last_error
      ),
      'crm', jsonb_build_object(
        'contacts', coalesce(ct.contacts, 0),
        'contactsMissingEmail', coalesce(ct.no_email, 0),
        'contactsMissingPhone', coalesce(ct.no_phone, 0),
        'contactsMissingTags', coalesce(ct.no_tags, 0),
        'contactsWithNotes', coalesce(nt.contacts_with_notes, 0),
        'contactsWithoutNotes', greatest(coalesce(ct.contacts,0) - coalesce(nt.contacts_with_notes,0), 0),
        'notes', coalesce(nt.notes, 0),
        'newestContactAt', ct.newest_contact,
        'newestNoteAt', nt.newest_note,
        'leads30d', coalesce(ml.leads_30d, 0),
        'leadsNotInGhl30d', coalesce(ml.leads_unpushed_30d, 0),
        'leadSyncErrors30d', coalesce(ml.leads_sync_errors_30d, 0)
      ),
      'pipeline', jsonb_build_object(
        'pipelines', coalesce(pl.pipelines, 0),
        'opportunities', coalesce(op.opportunities, 0),
        'openOpportunities', coalesce(op.open_opps, 0),
        'staleOpportunities', coalesce(op.stale_opps, 0),
        'openValue', coalesce(op.open_value, 0),
        'openTasks', coalesce(tk.open_tasks, 0),
        'overdueTasks', coalesce(tk.overdue_tasks, 0),
        'upcomingAppointments', coalesce(ap.upcoming_appts, 0),
        'pastAppointments60d', coalesce(ap.past_appts, 0),
        'noShows60d', coalesce(ap.no_shows, 0)
      ),
      'issues', (
        select coalesce(jsonb_agg(i), '[]'::jsonb) from (
          select jsonb_build_object('severity','critical','area','auth','message','No GoHighLevel token available for this sub-account') as i
            where not (coalesce(loc.has_pit,false) or _has_ws_key)
          union all
          select jsonb_build_object('severity','critical','area','auth','message','Last sync failed: ' || st.last_error)
            where coalesce(st.last_error,'') <> ''
          union all
          select jsonb_build_object('severity','critical','area','auth','message','Location id is not present in the synced sub-account list')
            where loc.location_id is null
          union all
          select jsonb_build_object('severity','warning','area','auth','message','No contact sync in the last 7 days')
            where st.last_contacts_sync_at is null or st.last_contacts_sync_at < now() - interval '7 days'
          union all
          select jsonb_build_object('severity','warning','area','data','message',
              coalesce(ml.leads_unpushed_30d,0) || ' of ' || coalesce(ml.leads_30d,0) || ' leads in the last 30 days are not linked to a GHL contact')
            where coalesce(ml.leads_unpushed_30d,0) > 0
          union all
          select jsonb_build_object('severity','warning','area','data','message',
              coalesce(ml.leads_sync_errors_30d,0) || ' lead pushes reported an error in the last 30 days')
            where coalesce(ml.leads_sync_errors_30d,0) > 0
          union all
          select jsonb_build_object('severity','warning','area','data','message','No contacts synced yet')
            where coalesce(ct.contacts,0) = 0
          union all
          select jsonb_build_object('severity','info','area','data','message',
              coalesce(ct.no_email,0) || ' contacts have no email address')
            where coalesce(ct.no_email,0) > 0
          union all
          select jsonb_build_object('severity','info','area','data','message',
              coalesce(ct.no_phone,0) || ' contacts have no phone number')
            where coalesce(ct.no_phone,0) > 0
          union all
          select jsonb_build_object('severity','warning','area','pipeline','message','No pipelines synced for this sub-account')
            where coalesce(pl.pipelines,0) = 0
          union all
          select jsonb_build_object('severity','warning','area','pipeline','message',
              coalesce(op.stale_opps,0) || ' open opportunities have not moved in 30+ days')
            where coalesce(op.stale_opps,0) > 0
          union all
          select jsonb_build_object('severity','warning','area','pipeline','message',
              coalesce(tk.overdue_tasks,0) || ' GHL tasks are overdue')
            where coalesce(tk.overdue_tasks,0) > 0
          union all
          select jsonb_build_object('severity','info','area','pipeline','message',
              coalesce(ap.no_shows,0) || ' appointments were marked no-show in the last 60 days')
            where coalesce(ap.no_shows,0) > 0
          union all
          select jsonb_build_object('severity','info','area','pipeline','message','No follow-up notes on any contact')
            where coalesce(nt.notes,0) = 0 and coalesce(ct.contacts,0) > 0
        ) q
      )
    ) as x
    from cl
    left join loc on loc.location_id = cl.ghl_location_id
    left join st on st.location_id = cl.ghl_location_id
    left join ct on ct.client_id = cl.id
    left join nt on nt.client_id = cl.id
    left join tk on tk.client_id = cl.id
    left join pl on pl.client_id = cl.id
    left join op on op.client_id = cl.id
    left join ap on ap.client_id = cl.id
    left join ml on ml.client_id = cl.id
  ) s;

  return jsonb_build_object(
    'generatedAt', now(),
    'workspaceId', _workspace_id,
    'hasAgencyKey', _has_ws_key,
    'accounts', coalesce(_rows, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.ghl_account_audit(uuid, integer) to authenticated, service_role;