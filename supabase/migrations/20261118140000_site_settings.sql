-- Configurar y regenerar el sitio desde la administración web (celular).
--   site_settings: una sola fila con títulos, color, enlace del logo y
--     versiones de lo subido. El Action site-sync la lee cada 15 min y, si
--     `version` cambió, regenera y publica el sitio.
--   tag_resources: enlaces por TAG (Especificaciones / Manual / Mantenimiento).
--   bucket site-sources: Excel de fichas y logo. Lectura pública (el contenido
--     se publica igual en el sitio); escritura solo oficina.

create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  site_title text not null,
  banner_title_full text not null,
  banner_title_short text not null,
  accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  logo_href text,
  fichas_file text,
  fichas_version timestamptz,
  logo_file text,
  logo_version timestamptz,
  version timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.tag_resources (
  tag_id text primary key,
  specifications text check (specifications is null or specifications ~* '^https?://'),
  handbook text check (handbook is null or handbook ~* '^https?://'),
  maintenance text check (maintenance is null or maintenance ~* '^https?://'),
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Cualquier cambio de enlaces sube la versión del sitio (para que se regenere).
create or replace function public.bump_site_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.site_settings set version = now() where id = 1;
  return null;
end;
$$;

create trigger tag_resources_bump_version
  after insert or update or delete on public.tag_resources
  for each statement execute function public.bump_site_version();

create or replace function public.touch_site_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := now();
  return new;
end;
$$;

create trigger site_settings_touch
  before update on public.site_settings
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.touch_site_settings();

alter table public.site_settings enable row level security;
alter table public.tag_resources enable row level security;

create policy "site_settings_select_public" on public.site_settings
  for select to anon, authenticated using (true);
create policy "site_settings_update_oficina" on public.site_settings
  for update to authenticated using (public.is_oficina()) with check (public.is_oficina());

create policy "tag_resources_select_public" on public.tag_resources
  for select to anon, authenticated using (true);
create policy "tag_resources_insert_oficina" on public.tag_resources
  for insert to authenticated with check (public.is_oficina());
create policy "tag_resources_update_oficina" on public.tag_resources
  for update to authenticated using (public.is_oficina()) with check (public.is_oficina());
create policy "tag_resources_delete_oficina" on public.tag_resources
  for delete to authenticated using (public.is_oficina());

revoke insert, delete on public.site_settings from anon, authenticated;

-- Bucket de fuentes del sitio
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-sources', 'site-sources', true, 26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'application/octet-stream',
    'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'
  ]
)
on conflict (id) do nothing;

create policy "site_sources_insert_oficina" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-sources' and public.is_oficina());
create policy "site_sources_update_oficina" on storage.objects
  for update to authenticated using (bucket_id = 'site-sources' and public.is_oficina());
create policy "site_sources_delete_oficina" on storage.objects
  for delete to authenticated using (bucket_id = 'site-sources' and public.is_oficina());
