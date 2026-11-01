-- Cloud copies of the phone's workout_session and workout_set tables (local migration 3).
-- See docs/decisions/0009-cloud-schema.md. The phone's "only one open workout" rule is not repeated here.

create table public.workout_session (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index workout_session_pull_idx on public.workout_session (user_id, server_updated_at);

create trigger workout_session_set_server_updated_at
  before insert or update on public.workout_session
  for each row execute function public.set_server_updated_at();

alter table public.workout_session enable row level security;
revoke all on table public.workout_session from anon;
grant select, insert, update, delete on table public.workout_session to authenticated;
create policy workout_session_own_rows on public.workout_session
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Metric units. Which of reps / weight_kg / duration_s / distance_m are set depends on the exercise's measurement_type.
create table public.workout_set (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  session_id uuid not null,
  exercise_id uuid not null,
  logged_at timestamptz not null,
  reps integer check (reps is null or reps >= 1),
  weight_kg double precision check (weight_kg is null or weight_kg >= 0),
  duration_s integer check (duration_s is null or duration_s >= 1),
  distance_m double precision check (distance_m is null or distance_m > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  foreign key (user_id, session_id) references public.workout_session (user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.exercise (user_id, id) on delete cascade
);

create index workout_set_session_idx on public.workout_set (user_id, session_id);
create index workout_set_exercise_idx on public.workout_set (user_id, exercise_id);
create index workout_set_pull_idx on public.workout_set (user_id, server_updated_at);

create trigger workout_set_set_server_updated_at
  before insert or update on public.workout_set
  for each row execute function public.set_server_updated_at();

alter table public.workout_set enable row level security;
revoke all on table public.workout_set from anon;
grant select, insert, update, delete on table public.workout_set to authenticated;
create policy workout_set_own_rows on public.workout_set
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
