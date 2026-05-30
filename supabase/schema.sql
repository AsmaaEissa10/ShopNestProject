-- Supabase schema for ShopNest registration metadata and consent tracking

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name varchar(50) not null,
  last_name varchar(80) not null,
  email_verified boolean not null default false,
  oauth_provider varchar(20),
  oauth_subject_id varchar(255),
  tos_version varchar(10) not null default '1.0',
  tos_accepted_at timestamptz not null default now(),
  marketing_opt_in boolean not null default false,
  status varchar(32) not null default 'pending_verification',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oauth_provider, oauth_subject_id)
);

create function if not exists public.users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at
before update on public.users
for each row
execute function public.users_updated_at();

create policy "Allow authenticated users to read own profile"
on public.users
for select using (auth.uid() = id);

create policy "Allow authenticated users to insert own profile"
on public.users
for insert with check (auth.uid() = id);
