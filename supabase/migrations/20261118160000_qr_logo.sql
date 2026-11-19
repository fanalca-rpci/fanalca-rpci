-- Logo del cliente a color (fondo blanco) para el centro de los QR.
-- El de site_settings.logo_file es el del banner (suele ser blanco).
alter table public.site_settings
  add column qr_logo_file text,
  add column qr_logo_version timestamptz;
