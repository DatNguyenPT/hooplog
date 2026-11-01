-- Cloud copies of the phone's shooting_session and shot tables (local migrations 1 and 2).
-- See docs/decisions/0009-cloud-schema.md. The phone's "only one open session" rule is not repeated here.

create table public.shooting_session (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index shooting_session_pull_idx on public.shooting_session (user_id, server_updated_at);

create trigger shooting_session_set_server_updated_at
  before insert or update on public.shooting_session
  for each row execute function public.set_server_updated_at();

alter table public.shooting_session enable row level security;
revoke all on table public.shooting_session from anon;
grant select, insert, update, delete on table public.shooting_session to authenticated;
create policy shooting_session_own_rows on public.shooting_session
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- confidence is double precision (not real) so a value round-trips exactly with the phone's REAL.
create table public.shot (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  session_id uuid not null,
  taken_at timestamptz not null,
  result text not null check (result in ('made', 'missed', 'uncertain')),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  confidence double precision,
  corrected boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id),
  foreign key (user_id, session_id) references public.shooting_session (user_id, id) on delete cascade
);

create index shot_session_idx on public.shot (user_id, session_id);
create index shot_pull_idx on public.shot (user_id, server_updated_at);

create trigger shot_set_server_updated_at
  before insert or update on public.shot
  for each row execute function public.set_server_updated_at();

alter table public.shot enable row level security;
revoke all on table public.shot from anon;
grant select, insert, update, delete on table public.shot to authenticated;
create policy shot_own_rows on public.shot
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
