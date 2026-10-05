
create extension if not exists pgcrypto;

create table public.settings (
  user_id uuid primary key default auth.uid(),
  publishing_active boolean not null default false,
  start_date date,
  post_time time not null default '18:00',
  reel_time time not null default '19:00',
  timezone text not null default 'Europe/Oslo',
  topic_mixing boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  source text not null default 'files',
  status text not null default 'importing',
  total_files int not null default 0,
  processed_files int not null default 0,
  allow_repeat boolean not null default false,
  import_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  batch_id uuid references public.batches(id) on delete set null,
  rel_path text not null,
  file_name text not null,
  kind text not null check (kind in ('reel','post')),
  sha256 text not null,
  size_bytes bigint not null default 0,
  mime text,
  storage_path text,
  upload_state text not null default 'pending',
  cover_path text,
  caption text,
  caption_source text,
  caption_issue text,
  topics text[] not null default '{}',
  seasonal boolean not null default false,
  campaign_first boolean not null default false,
  sort_index int not null default 0,
  skipped boolean not null default false,
  approved boolean not null default false,
  duration_s numeric,
  width int,
  height int,
  audio_state text not null default 'unchecked',
  audio_rms_db numeric,
  rendered_path text,
  rendered_verified jsonb,
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index assets_user_sha_unique on public.assets(user_id, sha256, batch_id);
create index assets_user_sched on public.assets(user_id, scheduled_at);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null references public.assets(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook')),
  status text not null default 'pending',
  container_id text,
  remote_id text,
  permalink text,
  attempts int not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  lease_owner text,
  lease_until timestamptz,
  intent_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (asset_id, platform)
);

create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  storage_path text not null,
  license_note text,
  duration_s numeric,
  created_at timestamptz not null default now()
);

create table public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  track_id uuid references public.audio_tracks(id) on delete set null,
  mode text not null default 'replace' check (mode in ('replace','mix','probe')),
  music_volume numeric not null default 0.8,
  status text not null default 'queued',
  progress int not null default 0,
  cancel_requested boolean not null default false,
  lease_owner text,
  lease_until timestamptz,
  output_path text,
  verification jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  level text not null default 'info',
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.meta_connection (
  user_id uuid primary key,
  page_id text, page_name text, ig_user_id text, ig_username text,
  status text not null default 'not_connected',
  token_expires_at timestamptz,
  scopes text[],
  last_error text,
  checked_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['settings','batches','assets','publications','audio_tracks','render_jobs','alerts','meta_connection'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "owner all" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Publications and connection status are written by the server only
drop policy "owner all" on public.publications;
create policy "owner read" on public.publications for select to authenticated using (user_id = auth.uid());
drop policy "owner all" on public.meta_connection;
create policy "owner read" on public.meta_connection for select to authenticated using (user_id = auth.uid());

-- Atomic lease claim for publisher
create or replace function public.claim_publications(_owner text, _limit int)
returns setof public.publications language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.publications p set lease_owner = _owner, lease_until = now() + interval '4 minutes', updated_at = now()
  where p.id in (
    select p2.id from public.publications p2
    join public.assets a on a.id = p2.asset_id
    join public.settings s on s.user_id = p2.user_id
    where s.publishing_active and not a.skipped and a.approved
      and p2.status in ('pending','processing','retry')
      and a.scheduled_at <= now()
      and a.scheduled_at > now() - interval '3 hours'
      and (p2.next_attempt_at is null or p2.next_attempt_at <= now())
      and (p2.lease_until is null or p2.lease_until < now())
    order by a.scheduled_at limit _limit
    for update of p2 skip locked)
  returning p.*;
end $$;
revoke all on function public.claim_publications(text,int) from public, anon, authenticated;
grant execute on function public.claim_publications(text,int) to service_role;

create or replace function public.claim_render_job(_owner text)
returns setof public.render_jobs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.render_jobs r set lease_owner = _owner, lease_until = now() + interval '10 minutes', status = 'processing', updated_at = now()
  where r.id = (select id from public.render_jobs where (status = 'queued' or (status='processing' and lease_until < now())) and not cancel_requested
     order by created_at limit 1 for update skip locked)
  returning r.*;
end $$;
revoke all on function public.claim_render_job(text) from public, anon, authenticated;
grant execute on function public.claim_render_job(text) to service_role;
