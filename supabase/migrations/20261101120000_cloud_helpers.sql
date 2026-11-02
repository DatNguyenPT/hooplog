-- Shared helper for the per-player mirror tables. See docs/decisions/0009-cloud-schema.md.
--
-- Stamps server_updated_at on every insert and update, so sync can ask "what changed since my last pull?"
-- without trusting the phone's clock. clock_timestamp() (not now()) keeps two writes in one transaction apart.
-- The trigger overwrites whatever the client sends, so the value cannot be faked.
-- Not security definer: it only touches the row being written. An empty search_path is set so it cannot be hijacked.
create function public.set_server_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;
