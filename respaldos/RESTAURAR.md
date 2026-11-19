# Cómo restaurar un respaldo

Los respaldos están en **Releases** del repo privado de respaldos:

- `base-AAAA-MM-DD` → `base-AAAA-MM-DD.tar.gz` con tres archivos:
  - `public.dump`: tablas del sistema (registros, rutinas, equipos, configuración, bitácoras…).
  - `auth_usuarios.dump`: usuarios de login (con sus contraseñas cifradas).
  - `storage_metadatos.dump`: lista de archivos de los buckets.
- `archivos-AAAA-MM-DD` → `.zip` con las fotos, audios, logos y PDF **nuevos** de esa semana. Para tener todos los archivos hay que descargar **todas** las releases `archivos-*` (cada archivo está en una sola).

## Restaurar en un proyecto Supabase nuevo (lo más seguro)

1. Crear el proyecto nuevo y anotar su cadena de conexión "Session pooler" (`DB_NUEVA`).
2. Aplicar las migraciones del repo del sitio: `supabase link --project-ref <nuevo>` y `supabase db push`.
3. Bajar la release de la semana elegida y descomprimir:
   ```bash
   gh release download base-AAAA-MM-DD -R <cuenta>/<repo-respaldos>
   tar -xzf base-AAAA-MM-DD.tar.gz
   ```
4. Usuarios primero, luego datos:
   ```bash
   pg_restore --no-owner --data-only -d "$DB_NUEVA" auth_usuarios.dump
   pg_restore --no-owner --data-only --disable-triggers -d "$DB_NUEVA" -n public public.dump
   pg_restore --no-owner --data-only -d "$DB_NUEVA" storage_metadatos.dump
   ```
   (`--disable-triggers` evita que los triggers de auditoría rechacen filas viejas.)
5. Subir los archivos: descargar todas las releases `archivos-*`, descomprimir y subir cada carpeta a su bucket (`supabase storage cp -r ...` o el panel).
6. Cambiar `site_config.json` del sitio a la URL y anon key del proyecto nuevo, regenerar y publicar.

## Restaurar solo unas filas borradas por error (mismo proyecto)

Restaurar `public.dump` en una base temporal (por ejemplo un proyecto Supabase de prueba o `pg_restore -f salida.sql` para verlo como texto), copiar las filas que falten y reinsertarlas con SQL. **No** restaurar encima del proyecto en uso sin respaldo previo del estado actual.

Usar `pg_restore` versión 17 (la de Supabase).

## Si el respaldo solo trae JSON (sin `SUPABASE_DB_URL`)

`base-AAAA-MM-DD.tar.gz` trae `json/<tabla>.json` (todas las tablas de `public`), `json/auth_users.json` (correos y fechas, **sin** contraseñas) y `json/resumen.json` (filas por tabla). Para restaurar: aplicar migraciones en el proyecto nuevo, recrear los usuarios (🧑 Usuarios en `/admin/` o el panel) y reinsertar cada tabla con la API o SQL (`insert … select * from json_populate_recordset(null::public.<tabla>, '<contenido>')`), en orden: catálogos (`equipment_classes`, `maintenance_activities`, `equipment_tags`), `profiles`, `maintenance_records` y sus hijas. Pedírselo a Claude con este archivo.
