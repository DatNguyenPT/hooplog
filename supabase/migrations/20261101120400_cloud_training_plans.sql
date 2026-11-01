-- Cloud copies of the phone's training_plan and plan_item tables (local migration 4).
-- See docs/decisions/0009-cloud-schema.md. The phone's "only one active plan" and "one item per exercise per day"
-- rules are not repeated here.

create table public.training_plan (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  is_active boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index training_plan_pull_idx on public.training_plan (user_id, server_updated_at);

create trigger training_plan_set_server_updated_at
  before insert or update on public.training_plan
  for each row execute function public.set_server_updated_at();

alter table public.training_plan enable row level security;
revoke all on table public.training_plan from anon;
grant select, insert, update, delete on table public.training_plan to authenticated;
create policy training_plan_own_rows on public.training_plan
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- One row per scheduled activity. weekday is ISO (1 = Monday ... 7 = Sunday).
-- An exercise item carries target_sets plus the targets that fit the exercise's measurement type (metric units);
-- a shooting item carries target_shots. exercise_id is null for shooting items, so that foreign key is skipped for them.
create table public.plan_item (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  plan_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  kind text not null check (kind in ('exercise', 'shooting')),
  exercise_id uuid,
  target_sets integer check (target_sets is null or target_sets >= 1),
  target_reps integer check (target_reps is null or target_reps >= 1),
  target_weight_kg double precision check (target_weight_kg is null or target_weight_kg >= 0),
  target_duration_s integer check (target_duration_s is null or target_duration_s >= 1),
  target_distance_m double precision check (target_distance_m is null or target_distance_m > 0),
  target_shots integer check (target_shots is null or target_shots >= 1),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  foreign key (user_id, plan_id) references public.training_plan (user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.exercise (user_id, id) on delete cascade,
  check (
    (kind = 'exercise' and exercise_id is not null and target_sets is not null and target_shots is null)
    or (kind = 'shooting' and exercise_id is null and target_shots is not null and target_sets is null)
  )
);

create index plan_item_plan_idx on public.plan_item (user_id, plan_id);
create index plan_item_exercise_idx on public.plan_item (user_id, exercise_id);
create index plan_item_pull_idx on public.plan_item (user_id, server_updated_at);

create trigger plan_item_set_server_updated_at
  before insert or update on public.plan_item
  for each row execute function public.set_server_updated_at();

alter table public.plan_item enable row level security;
revoke all on table public.plan_item from anon;
grant select, insert, update, delete on table public.plan_item to authenticated;
create policy plan_item_own_rows on public.plan_item
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
