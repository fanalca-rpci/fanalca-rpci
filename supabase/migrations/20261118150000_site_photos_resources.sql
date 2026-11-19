-- Fotos de equipos tomadas desde el celular y enlaces subidos en bloque.
--   tag_photos: fotos por TAG en el bucket site-sources (fotos/<TAG>/...).
--     site_sync.py las pone primero en la ficha.
--   site_settings.resources_file/version: TAG_RESOURCES.xlsx subido desde la
--     web; los enlaces editados uno por uno (tag_resources) tienen prioridad.

create table public.tag_photos (
  id uuid primary key default gen_random_uuid(),
  tag_id text not null,
  path text not null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index tag_photos_tag_idx on public.tag_photos (tag_id, created_at);

alter table public.tag_photos enable row level security;
create policy "tag_photos_select_public" on public.tag_photos
  for select to anon, authenticated using (true);
create policy "tag_photos_insert_oficina" on public.tag_photos
  for insert to authenticated with check (public.is_oficina());
create policy "tag_photos_delete_oficina" on public.tag_photos
  for delete to authenticated using (public.is_oficina());

create trigger tag_photos_bump_version
  after insert or delete on public.tag_photos
  for each statement execute function public.bump_site_version();

alter table public.site_settings
  add column resources_file text,
  add column resources_version timestamptz;
