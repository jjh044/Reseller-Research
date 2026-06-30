create table if not exists public.brand_files (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  brand_id text not null,
  brand text not null,
  saved_at timestamptz not null default now(),
  report_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, brand_id)
);

create index if not exists brand_files_client_brand_idx
  on public.brand_files (client_id, brand);

alter table public.brand_files enable row level security;

drop policy if exists "brand files are server managed" on public.brand_files;
create policy "brand files are server managed"
  on public.brand_files
  for all
  using (false)
  with check (false);
