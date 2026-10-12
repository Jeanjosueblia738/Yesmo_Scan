-- Yesmo Scan, corrections : un seul pointage si intervention + scan, journal des scans,
-- pièce jointe au congé, demande de changement d'appareil.
-- À coller dans Supabase > SQL Editor > Run (une seule fois).

alter table leaves add column if not exists proof text;

-- Une présence d'intervention et un vrai scan le même jour : on garde le scan.
delete from attendance a
where a.source = 'intervention'
  and exists (
    select 1 from attendance b
    where b.uid = a.uid and b.date = a.date and b.id <> a.id
      and coalesce(b.source, 'scan') <> 'intervention'
  );

create or replace function do_punch(p_uid uuid, p_token text, p_device text, p_geo jsonb, p_anoms text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u profiles; a attendance; synth attendance; t text; new_id uuid; last_ts timestamptz;
  today date := (now() at time zone 'Africa/Abidjan')::date;
  anoms text[] := coalesce(p_anoms, '{}');
  is_late boolean := false; l_status text; l_motif text;
begin
  select * into u from profiles where id = p_uid for update;
  if not found or not u.active then raise exception 'Compte désactivé'; end if;
  if u.device_id is distinct from p_device then
    raise exception 'Appareil non reconnu pour ce compte. Demandez le changement d''appareil.';
  end if;
  if u.last_token = p_token then raise exception 'Code déjà utilisé, attendez le suivant'; end if;

  perform close_open_sessions(p_uid);

  select max(greatest(check_in, coalesce(check_out, check_in))) into last_ts
    from attendance
   where uid = p_uid and date = today and coalesce(source, 'scan') <> 'intervention';
  if last_ts is not null and now() - last_ts < interval '2 minutes' then
    raise exception 'Pointage déjà enregistré il y a moins de 2 minutes (doublon refusé)';
  end if;

  select * into a from attendance where uid = p_uid and check_out is null for update;
  if a.id is not null then
    update attendance
       set check_out = now(), duration_min = round(extract(epoch from (now() - check_in)) / 60),
           anomalies = anomalies || anoms, geo_out = p_geo
     where id = a.id;
    t := 'Sortie'; new_id := a.id;
  else
    if on_leave(p_uid, today) then anoms := anoms || array['pointage pendant congé']; end if;
    is_late := not exists (
        select 1 from attendance
         where uid = p_uid and date = today and coalesce(source, 'scan') <> 'intervention')
      and (now() at time zone 'Africa/Abidjan')::time >= late_from()
      and not on_leave(p_uid, today);
    if is_late and exists (select 1 from interventions
                           where uid = p_uid and status = 'validée' and today between date_start and date_end) then
      l_status := 'validé'; l_motif := 'Intervention client';
    end if;

    select * into synth from attendance
     where uid = p_uid and date = today and source = 'intervention'
     order by check_in desc limit 1
     for update;
    if synth.id is not null and not exists (
        select 1 from attendance where uid = p_uid and date = today and id <> synth.id) then
      anoms := anoms || array['remplace une présence d’intervention'];
      update attendance set
        check_in = now(), check_out = null, duration_min = null, auto_closed = false, source = 'scan',
        anomalies = anomalies || anoms, geo_in = p_geo,
        late = is_late, late_status = l_status, late_motif = coalesce(l_motif, late_motif)
      where id = synth.id;
      new_id := synth.id;
    else
      insert into attendance (uid, matricule, nom, prenom, manager_id, date, check_in, anomalies, geo_in, late, late_status, late_motif)
      values (u.id, u.matricule, u.nom, u.prenom, u.manager_id, today, now(), anoms, p_geo, is_late, l_status, l_motif)
      returning id into new_id;
    end if;
    t := 'Entrée';
  end if;
  update profiles set last_token = p_token where id = p_uid;
  insert into attendance_log (attendance_id, uid, by_id, action, after)
  values (new_id, p_uid, p_uid, case when t = 'Entrée' then 'pointage arrivée' else 'pointage départ' end, jsonb_build_object('type', t));
  return jsonb_build_object('type', t, 'at', (extract(epoch from now()) * 1000)::bigint,
    'anomalies', to_jsonb(anoms), 'late', is_late, 'lateStatus', l_status, 'attendanceId', new_id);
end $$;

revoke execute on function do_punch(uuid, text, text, jsonb, text[]) from public, anon, authenticated;

drop policy if exists log_read on attendance_log;
create policy log_read on attendance_log for select to authenticated using (
  my_role() = 'admin'
  or uid = auth.uid()
  or (my_role() = 'manager' and exists (
    select 1 from profiles p where p.id = attendance_log.uid and p.manager_id = auth.uid()))
);

create table if not exists device_requests (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references profiles(id),
  matricule text, nom text, prenom text, manager_id uuid,
  device_id text not null,
  status text not null default 'en attente',
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table device_requests enable row level security;
drop policy if exists device_requests_read on device_requests;
create policy device_requests_read on device_requests for select to authenticated
  using (uid = auth.uid() or my_role() = 'admin' or (my_role() = 'manager' and manager_id = auth.uid()));

do $$ begin alter publication supabase_realtime add table leaves; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table interventions; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table device_requests; exception when others then null; end $$;
