-- Unpackd schema
create table if not exists public.boxes (
  id uuid primary key,
  nfc_id text unique,
  label text,
  created_at timestamp with time zone default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid references public.boxes(id) on delete cascade,
  name text not null,
  quantity int not null default 1
);

-- RLS: enable
alter table public.boxes enable row level security;
alter table public.items enable row level security;

-- NOTE: For migration phase, allow public read/write (adjust later)
create policy "Public read boxes" on public.boxes for select using (true);
create policy "Public write boxes" on public.boxes for insert with check (true);

create policy "Public read items" on public.items for select using (true);
create policy "Public write items" on public.items for insert with check (true);
