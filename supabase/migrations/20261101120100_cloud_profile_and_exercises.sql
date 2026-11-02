-- Cloud copies of the phone's profile (local migration 5) and exercise (local migration 3) tables.
-- See docs/decisions/0009-cloud-schema.md for why every table looks like this.

-- profile: the phone keeps at most one live row; the cloud does not enforce that (sync repairs conflicts).
create table public.profile (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  onboarded_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index profile_pull_idx on public.profile (user_id, server_updated_at);

create trigger profile_set_server_updated_at
  before insert or update on public.profile
  for each row execute function public.set_server_updated_at();

alter table public.profile enable row level security;
revoke all on table public.profile from anon;
grant select, insert, update, delete on table public.profile to authenticated;
create policy profile_own_rows on public.profile
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- exercise: built-ins (fixed ids, name is a translation key) are uploaded as ordinary rows, one copy per player.
create table public.exercise (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(name) between 1 and 100),
  category text not null check (char_length(category) between 1 and 40),
  measurement_type text not null check (measurement_type in ('reps', 'reps_weight', 'duration', 'distance')),
  is_builtin boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index exercise_pull_idx on public.exercise (user_id, server_updated_at);

create trigger exercise_set_server_updated_at
  before insert or update on public.exercise
  for each row execute function public.set_server_updated_at();

alter table public.exercise enable row level security;
revoke all on table public.exercise from anon;
grant select, insert, update, delete on table public.exercise to authenticated;
create policy exercise_own_rows on public.exercise
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
