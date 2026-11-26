-- VORTEX AI Phase 3E: Shared atomic replay-nonce persistence and UUID ownership constraints.
-- Prepared as migration file only; do not apply directly without change authorization.

create table if not exists public.vortex_ingest_nonces (
  bot_id text not null check (bot_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  nonce text not null check (nonce ~ '^[A-Za-z0-9._-]{8,128}$'),
  request_ts timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (bot_id, nonce)
);

create index if not exists idx_vortex_ingest_nonces_expires_at
  on public.vortex_ingest_nonces (expires_at);

alter table public.vortex_ingest_nonces enable row level security;
revoke all on table public.vortex_ingest_nonces from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, delete on table public.vortex_ingest_nonces to service_role;

create or replace function public.consume_vortex_ingest_nonce(
  p_bot_id text,
  p_nonce text,
  p_request_ts timestamptz,
  p_ttl_seconds integer default 300
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_inserted boolean := false;
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds, 300), 3600));
begin
  if p_bot_id is null or p_bot_id !~ '^[A-Za-z0-9._-]{1,64}$' then
    raise exception 'invalid bot id';
  end if;
  if p_nonce is null or p_nonce !~ '^[A-Za-z0-9._-]{8,128}$' then
    raise exception 'invalid nonce';
  end if;
  if p_request_ts is null then
    raise exception 'invalid request timestamp';
  end if;

  -- Bounded retention cleanup of expired nonces.
  delete from public.vortex_ingest_nonces
  where expires_at < pg_catalog.now();

  -- Atomic insert: unique primary key (bot_id, nonce) prevents concurrent race conditions.
  insert into public.vortex_ingest_nonces (bot_id, nonce, request_ts, expires_at, created_at)
  values (
    p_bot_id,
    p_nonce,
    p_request_ts,
    pg_catalog.now() + pg_catalog.make_interval(secs => v_ttl),
    pg_catalog.now()
  )
  on conflict (bot_id, nonce) do nothing
  returning true into v_inserted;

  return pg_catalog.jsonb_build_object('accepted', coalesce(v_inserted, false));
end;
$$;

revoke all on function public.consume_vortex_ingest_nonce(text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_vortex_ingest_nonce(text, text, timestamptz, integer) to service_role;
