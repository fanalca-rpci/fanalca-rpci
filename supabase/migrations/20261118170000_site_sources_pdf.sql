-- Permitir PDF en site-sources: manuales y fichas subidos desde ⚙️ Equipos.
update storage.buckets
set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/octet-stream',
  'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp',
  'application/pdf'
]
where id = 'site-sources';
