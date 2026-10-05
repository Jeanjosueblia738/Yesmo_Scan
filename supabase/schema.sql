-- Yesmo Scan : à coller dans Supabase > SQL Editor > Run.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  matricule text unique not null,
  nom text not null, prenom text not null,
  role text not null check (role in ('admin','manager','employee','kiosk')),
  manager_id uuid references profiles(id),
  active boolean not null default true,
  device_id text, last_token text,
  created_at timestamptz not null default now()
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references profiles(id),
  matricule text, nom text, prenom text,
  manager_id uuid,
  date date not null,
  check_in timestamptz not null, check_out timestamptz, duration_min int,
  anomalies text[] not null default '{}',
  geo_in jsonb, geo_out jsonb
);
create index on attendance (uid, check_in desc);
create index on attendance (manager_id, check_in desc);
-- Garantie d'atomicité : un seul pointage ouvert par personne, même en cas de scans simultanés.
create unique index one_open_per_user on attendance (uid) where check_out is null;

create table corrections (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references profiles(id),
  matricule text, nom text, prenom text, manager_id uuid,
  date date not null, in_time text not null, out_time text not null, motif text not null,
  status text not null default 'en attente',
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on corrections (uid, created_at desc);

create table attempts (
  id bigserial primary key,
  uid uuid, ts timestamptz not null default now(),
  result text, reason text, device_id text
);

create table settings (key text primary key, value jsonb not null);
create table counters (role text primary key, n int not null default 0);

-- Rôle de l'utilisateur connecté (security definer : évite la récursion des règles).
create function my_role() returns text language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create function next_counter(p_role text) returns int language sql security definer set search_path = public as
$$ insert into counters (role, n) values (p_role, 1)
   on conflict (role) do update set n = counters.n + 1 returning n $$;

-- Pointage atomique : verrouille le profil, ferme la session ouverte ou en ouvre une.
create function do_punch(p_uid uuid, p_token text, p_device text, p_geo jsonb, p_anoms text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare u profiles; a attendance; t text;
begin
  select * into u from profiles where id = p_uid for update;
  if not found or not u.active then raise exception 'Compte désactivé'; end if;
  if u.device_id is distinct from p_device then
    raise exception 'Appareil non reconnu pour ce compte. Demandez à l''admin de libérer l''appareil.';
  end if;
  if u.last_token = p_token then raise exception 'Code déjà utilisé, attendez le suivant'; end if;
  select * into a from attendance where uid = p_uid and check_out is null for update;
  if found then
    update attendance set check_out = now(),
      duration_min = round(extract(epoch from (now() - check_in)) / 60),
      anomalies = anomalies || p_anoms, geo_out = p_geo where id = a.id;
    t := 'Sortie';
  else
    insert into attendance (uid, matricule, nom, prenom, manager_id, date, check_in, anomalies, geo_in)
    values (u.id, u.matricule, u.nom, u.prenom, u.manager_id, (now() at time zone 'Africa/Abidjan')::date, now(), p_anoms, p_geo);
    t := 'Entrée';
  end if;
  update profiles set last_token = p_token where id = p_uid;
  return jsonb_build_object('type', t, 'at', (extract(epoch from now()) * 1000)::bigint, 'anomalies', to_jsonb(p_anoms));
end $$;

-- Les fonctions sensibles ne sont appelables que par le serveur (clé service_role).
revoke execute on function do_punch(uuid, text, text, jsonb, text[]) from public, anon, authenticated;
revoke execute on function next_counter(text) from public, anon, authenticated;

-- Règles d'accès : lecture seule côté navigateur, toute écriture passe par l'API.
alter table profiles enable row level security;
alter table attendance enable row level security;
alter table corrections enable row level security;
alter table attempts enable row level security;
alter table settings enable row level security;
alter table counters enable row level security;

create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or my_role() = 'admin' or (my_role() = 'manager' and manager_id = auth.uid()));
create policy attendance_read on attendance for select to authenticated
  using (uid = auth.uid() or my_role() = 'admin' or (my_role() = 'manager' and manager_id = auth.uid()));
create policy corrections_read on corrections for select to authenticated
  using (uid = auth.uid() or my_role() = 'admin' or (my_role() = 'manager' and manager_id = auth.uid()));
create policy attempts_read on attempts for select to authenticated using (my_role() = 'admin');
create policy settings_admin on settings for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
