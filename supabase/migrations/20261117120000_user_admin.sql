-- Administración web de usuarios (fase 1):
--   1. profiles.active: desactivar en vez de borrar.
--   2. is_member()/is_oficina() exigen active = true: un desactivado con la
--      sesión abierta no puede escribir aunque su token siga vigente.
--   3. user_admin_log: quién hizo qué sobre qué usuario. Solo oficina lee;
--      solo la Edge Function admin-users (service_role) escribe.

alter table public.profiles
  add column active boolean not null default true;

create or replace function public.is_member()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and active
  );
$$;

create or replace function public.is_oficina()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'oficina' and active
  );
$$;

create table public.user_admin_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  target_id uuid references auth.users(id),
  action text not null
    check (action in ('create', 'set_role', 'reset_password', 'deactivate', 'reactivate')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index user_admin_log_created_at_idx on public.user_admin_log (created_at desc);

alter table public.user_admin_log enable row level security;

create policy "user_admin_log_select_oficina"
  on public.user_admin_log for select
  to authenticated
  using (public.is_oficina());

-- Sin policies de insert/update/delete: solo service_role escribe.
revoke insert, update, delete on public.user_admin_log from anon, authenticated;
