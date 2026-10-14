create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  credits integer not null default 10 check (credits >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  v0_chat_id text not null unique,
  v0_project_id text,
  vercel_project_id text,
  status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed', 'live')),
  gen_status text not null default 'ready'
    check (gen_status in ('generating', 'ready', 'failed')),
  gen_charged integer not null default 0 check (gen_charged >= 0),
  gen_started_at timestamptz,
  gen_prev_version text,
  subdomain text unique,
  custom_domain text unique,
  custom_domain_verified boolean not null default false,
  domain_checked_at timestamptz,
  github_repo text,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists apps_owner_created_at_idx
  on public.apps (owner_id, created_at desc);

create table if not exists public.credit_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  amount integer not null check (amount <> 0),
  kind text not null,
  external_event_id text unique,
  refund_of bigint unique references public.credit_transactions (id),
  created_at timestamptz not null default now()
);

create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);

create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps (id) on delete cascade,
  url text not null,
  status text not null default 'ready',
  created_at timestamptz not null default now()
);

create index if not exists deployments_app_created_idx
  on public.deployments (app_id, created_at desc);

create table if not exists public.domain_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  domain text not null,
  charged_cents integer not null check (charged_cents >= 0),
  stripe_session text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'registered', 'refunded')),
  created_at timestamptz not null default now()
);

create table if not exists public.github_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login text not null,
  token_enc text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.preview_tokens (
  token text primary key,
  upstream text not null,
  expires_at timestamptz not null
);

create index if not exists preview_tokens_expires_at_idx
  on public.preview_tokens (expires_at);

create table if not exists public.stripe_events (
  id text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email)
select id, email
from auth.users
on conflict (id) do update set email = excluded.email;

create or replace function public.spend_credits(
  p_user uuid,
  p_amount integer,
  p_kind text,
  p_app uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user is null or p_amount is null or p_amount <= 0
     or p_kind not in ('generate', 'iterate', 'deploy') then
    raise exception 'Invalid credit spend' using errcode = '22023';
  end if;

  update public.profiles
  set credits = credits - p_amount
  where id = p_user and credits >= p_amount;

  if not found then
    return false;
  end if;

  insert into public.credit_transactions (user_id, app_id, amount, kind)
  values (p_user, p_app, -p_amount, p_kind);

  return true;
end;
$$;

create or replace function public.refund_credits(
  p_user uuid,
  p_amount integer,
  p_app uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_spend_id bigint;
begin
  if p_user is null or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid credit refund' using errcode = '22023';
  end if;

  select spend.id
  into v_spend_id
  from public.credit_transactions as spend
  where spend.user_id = p_user
    and spend.app_id is not distinct from p_app
    and spend.amount = -p_amount
    and spend.kind in ('generate', 'iterate', 'deploy')
    and not exists (
      select 1
      from public.credit_transactions as refund
      where refund.refund_of = spend.id
    )
  order by spend.id desc
  limit 1
  for update of spend skip locked;

  if v_spend_id is null then
    return false;
  end if;

  update public.profiles
  set credits = credits + p_amount
  where id = p_user;

  if not found then
    return false;
  end if;

  insert into public.credit_transactions (user_id, app_id, amount, kind, refund_of)
  values (p_user, p_app, p_amount, 'refund', v_spend_id);

  return true;
end;
$$;

create or replace function public.add_credits(
  p_user uuid,
  p_amount integer,
  p_event text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction_id bigint;
begin
  if p_user is null or p_amount is null or p_amount <= 0
     or nullif(btrim(p_event), '') is null then
    raise exception 'Invalid credit grant' using errcode = '22023';
  end if;

  insert into public.credit_transactions (user_id, amount, kind, external_event_id)
  values (p_user, p_amount, 'grant', p_event)
  on conflict (external_event_id) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    return true;
  end if;

  update public.profiles
  set credits = credits + p_amount
  where id = p_user;

  if not found then
    raise exception 'Profile not found for credit grant';
  end if;

  return true;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.spend_credits(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.refund_credits(uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.add_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer, text, uuid) to service_role;
grant execute on function public.refund_credits(uuid, integer, uuid) to service_role;
grant execute on function public.add_credits(uuid, integer, text) to service_role;

alter table public.profiles enable row level security;
alter table public.apps enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.deployments enable row level security;
alter table public.domain_orders enable row level security;
alter table public.github_connections enable row level security;
alter table public.preview_tokens enable row level security;
alter table public.stripe_events enable row level security;

grant select on public.profiles, public.apps to authenticated;
grant all on public.profiles, public.apps, public.credit_transactions,
  public.deployments, public.domain_orders, public.github_connections,
  public.preview_tokens, public.stripe_events to service_role;
grant usage, select on sequence public.credit_transactions_id_seq to service_role;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users can read their own apps" on public.apps;
create policy "Users can read their own apps"
  on public.apps for select to authenticated
  using (owner_id = (select auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'attachments',
  'attachments',
  true,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'apps'
  ) then
    alter publication supabase_realtime add table public.apps;
  end if;
end;
$$;
