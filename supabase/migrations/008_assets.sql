-- 008_assets.sql
-- Asset library: Supabase Storage bucket + assets table for files and links.

-- ─── Storage bucket ───────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;

-- Storage RLS: authenticated users only
create policy "authenticated users can upload assets"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'assets');

create policy "authenticated users can read assets"
  on storage.objects for select to authenticated
  using (bucket_id = 'assets');

create policy "authenticated users can delete assets"
  on storage.objects for delete to authenticated
  using (bucket_id = 'assets');

-- ─── Assets table ─────────────────────────────────────────────────────────────

create table public.assets (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null
                check (type in (
                  'resume', 'transcript', 'highlight_reel',
                  'game_film', 'sports_recruits', 'link', 'other'
                )),
  category      text not null default 'file'
                check (category in ('file', 'link')),
  -- file fields
  storage_path  text,
  file_name     text,
  file_size     integer,
  mime_type     text,
  -- link fields
  url           text,
  -- shared
  description   text,
  is_current    boolean not null default true,
  version       integer not null default 1,
  replaced_by   uuid references public.assets(id),
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "auth users full access on assets"
  on public.assets for all to authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.assets;
