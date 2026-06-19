-- =====================================================================
--  Group / pool leaderboards for the World Cup 2026 predictor.
--
--  A "pool" is a shared code (e.g. FAMILY). The global leaderboard stays
--  exactly as-is; a pool board is that same list filtered to its members.
--  Membership is many-to-many: you can be in several pools and still rank
--  globally. Pools can be password-protected (checked server-side; the
--  password is never readable by clients).
--
--  Run this once in the Supabase SQL editor (in addition to the existing
--  `submissions` table from the README).
-- =====================================================================

create extension if not exists pgcrypto;

-- Pools. Only reachable through the join_or_create_group() function below,
-- so the password hash is never exposed to clients.
create table if not exists groups (
  code       text primary key,
  name       text,
  pass_hash  text,                       -- null = open pool, no password
  created_at timestamptz not null default now()
);
alter table groups enable row level security;
-- (no select/insert policies → clients can't read the table directly)

-- Who belongs to which pool. Readable so the app can filter the board and
-- show member counts; you can only delete your own membership.
create table if not exists memberships (
  user_id    uuid not null,
  group_code text not null references groups(code) on delete cascade,
  group_name text,
  created_at timestamptz not null default now(),
  primary key (user_id, group_code)
);
alter table memberships enable row level security;
create policy "anyone can read" on memberships for select using (true);
create policy "delete own"      on memberships for delete using (auth.uid() = user_id);
-- (inserts happen only inside the function below, which runs as owner)

-- Join an existing pool (password-checked) or create it if the code is new.
-- IMPORTANT: only the ADMIN (the email below) may CREATE pools and set their
-- password. Everyone else can only JOIN pools that already exist. Change the
-- email to your own Google sign-in address.
create or replace function join_or_create_group(p_code text, p_name text, p_password text)
returns table (code text, name text, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email constant text := 'andrewfogarty111@gmail.com';  -- only this user can create pools
  v_code  text := upper(btrim(p_code));
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  g       groups%rowtype;
  v_new   boolean := false;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if v_code = '' then raise exception 'pool code required'; end if;

  select * into g from groups where groups.code = v_code;
  if not found then
    -- Pool doesn't exist → only the admin may create it.
    if v_email <> admin_email then
      raise exception 'pool not found';
    end if;
    insert into groups (code, name, pass_hash)
      values (v_code,
              nullif(btrim(p_name), ''),
              case when coalesce(p_password, '') = '' then null
                   else crypt(p_password, gen_salt('bf')) end)
      returning * into g;
    v_new := true;
  elsif g.pass_hash is not null then
    if p_password is null or crypt(p_password, g.pass_hash) <> g.pass_hash then
      raise exception 'bad password';
    end if;
  end if;

  insert into memberships (user_id, group_code, group_name)
    values (v_uid, v_code, g.name)
    on conflict (user_id, group_code) do update set group_name = excluded.group_name;

  return query select g.code, g.name, v_new;
end;
$$;

grant execute on function join_or_create_group(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
--  One-time: move every EXISTING bracket into a "Family" pool.
-- ---------------------------------------------------------------------
insert into groups (code, name) values ('FAMILY', 'Family')
  on conflict (code) do nothing;

insert into memberships (user_id, group_code, group_name)
  select distinct user_id, 'FAMILY', 'Family'
    from submissions
   where user_id is not null
  on conflict (user_id, group_code) do nothing;

-- Optional: password-protect the Family pool for anyone joining LATER
-- (people already enrolled above stay in). Uncomment and pick a password:
-- update groups set pass_hash = crypt('your-password', gen_salt('bf')) where code = 'FAMILY';
