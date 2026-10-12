-- Yesmo Scan, mise à jour 2 : retards (10h00), interventions, congés déclarés,
-- clôture automatique à minuit, saisie manuelle tracée.
-- À coller dans Supabase > SQL Editor > Run (une seule fois).

alter table attendance
  add column if not exists late boolean not null default false,
  add column if not exists late_motif text,
  add column if not exists late_comment text,
  add column if not exists late_status text,          -- null | 'en attente' | 'validé' | 'refusé'
  add column if not exists late_decided_by uuid,
  add column if not exists late_decided_at timestamptz,
  add column if not exists auto_closed boolean not null default false,
  add column if not exists source text not null default 'scan',  -- scan | manuel | correction | intervention
  add column if not exists note text,
  add column if not exists manual_by uuid,
  add column if not exists manual_at timestamptz;

-- Historique de toutes les décisions et modifications.
create table if not exists attendance_log (
  id bigserial primary key,
  attendance_id uuid, uid uuid, by_id uuid,
  action text, motif text, before jsonb, after jsonb,
  ts timestamptz not null default now()
);

create table if not exists interventions (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references profiles(id),
  matricule text, nom text, prenom text, manager_id uuid,
  client text not null,
  date_start date not null, date_end date not null,
  start_time text, end_time text, full_day boolean not null default false,
  comment text,
  status text not null default 'en attente',          -- en attente | validée | refusée
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists interventions_uid on interventions (uid, date_start);

-- Congés déjà validés dans l'autre système et déclarés ici.
-- Les jours de congé vont de start_date (inclus) à return_date (exclu, jour de reprise).
create table if not exists leaves (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references profiles(id),
  matricule text, nom text, prenom text, manager_id uuid,
  type text not null,
  start_date date not null, return_date date not null,
  reference text not null, comment text,
  declared_by uuid,
  status text not null default 'déclaré',             -- déclaré | vérifié | contesté
  checked_by uuid, checked_at timestamptz,
  created_at timestamptz not null default now(),
  check (return_date > start_date)
);
create index if not exists leaves_uid on leaves (uid, start_date);

create or replace function late_from() returns time language sql stable security definer set search_path = public as
$$ select coalesce((select (value->>'lateFrom')::time from settings where key = 'rules'), time '10:00') $$;

create or replace function on_leave(p_uid uuid, p_date date) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from leaves where uid = p_uid and status <> 'contesté'
                  and p_date >= start_date and p_date < return_date) $$;

-- Ferme les arrivées restées sans départ les jours précédents (départ non pointé).
create or replace function close_open_sessions(p_uid uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update attendance
     set check_out = ((date + 1)::timestamp at time zone 'Africa/Abidjan') - interval '1 second',
         duration_min = null, auto_closed = true,
         anomalies = anomalies || array['départ non pointé']
   where check_out is null
     and date < (now() at time zone 'Africa/Abidjan')::date
     and (p_uid is null or uid = p_uid);
  get diagnostics n = row_count;
  return n;
end $$;

-- Pointage atomique (remplace la version précédente, même signature).
create or replace function do_punch(p_uid uuid, p_token text, p_device text, p_geo jsonb, p_anoms text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  u profiles; a attendance; t text; new_id uuid; last_ts timestamptz;
  today date := (now() at time zone 'Africa/Abidjan')::date;
  anoms text[] := coalesce(p_anoms, '{}');
  is_late boolean := false; l_status text; l_motif text;
begin
  select * into u from profiles where id = p_uid for update;
  if not found or not u.active then raise exception 'Compte désactivé'; end if;
  if u.device_id is distinct from p_device then
    raise exception 'Appareil non reconnu pour ce compte. Demandez à l''admin de libérer l''appareil.';
  end if;
  if u.last_token = p_token then raise exception 'Code déjà utilisé, attendez le suivant'; end if;

  perform close_open_sessions(p_uid);

  select max(greatest(check_in, coalesce(check_out, check_in))) into last_ts
    from attendance where uid = p_uid and date = today;
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
    is_late := not exists (select 1 from attendance where uid = p_uid and date = today)
               and (now() at time zone 'Africa/Abidjan')::time >= late_from()
               and not on_leave(p_uid, today);
    if is_late and exists (select 1 from interventions
                           where uid = p_uid and status = 'validée' and today between date_start and date_end) then
      l_status := 'validé'; l_motif := 'Intervention client';
    end if;
    insert into attendance (uid, matricule, nom, prenom, manager_id, date, check_in, anomalies, geo_in, late, late_status, late_motif)
    values (u.id, u.matricule, u.nom, u.prenom, u.manager_id, today, now(), anoms, p_geo, is_late, l_status, l_motif)
    returning id into new_id;
    t := 'Entrée';
  end if;
  update profiles set last_token = p_token where id = p_uid;
  return jsonb_build_object('type', t, 'at', (extract(epoch from now()) * 1000)::bigint,
    'anomalies', to_jsonb(anoms), 'late', is_late, 'lateStatus', l_status, 'attendanceId', new_id);
end $$;

revoke execute on function close_open_sessions(uuid) from public, anon, authenticated;
revoke execute on function late_from() from public, anon, authenticated;
revoke execute on function on_leave(uuid, date) from public, anon, authenticated;

alter table attendance_log enable row level security;
alter table interventions enable row level security;
alter table leaves enable row level security;

drop policy if exists log_read on attendance_log;
create policy log_read on attendance_log for select to authenticated using (my_role() = 'admin');
drop policy if exists interventions_read on interventions;
create policy interventions_read on interventions for select to authenticated
  using (uid = auth.uid() or my_role() = 'admin' or (my_role() = 'manager' and manager_id = auth.uid()));
drop policy if exists leaves_read on leaves;
create policy leaves_read on leaves for select to authenticated
  using (uid = auth.uid() or my_role() = 'admin' or (my_role() = 'manager' and manager_id = auth.uid()));
