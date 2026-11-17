# Instructivo: montar el proyecto para una empresa nueva (otro laptop, WSL + Claude Code)

Sirve para llevar este sistema (sitio de fichas técnicas con QR + histórico y plan de mantenimiento en Supabase) a **otra empresa**, en **otro laptop con Windows 11 + WSL (Ubuntu)**, con **sus propias cuentas** de GitHub, Supabase y Gmail. Las cuentas ya existen; este documento no cubre crearlas.

**Regla de oro: un proyecto = un repo de GitHub + un proyecto de Supabase.** No se reutiliza el repo ni la base de D'Vida: GitHub Pages sirve `docs/` de *ese* repo, los QR (`urls.txt`) se arman con el remote de git, y los mantenimientos se guardan por TAG en texto, así que dos empresas con el mismo TAG (`100-P-01A`) se mezclarían en una misma base.

**Cómo usarlo:** en el laptop nuevo, abre Claude Code en la carpeta del proyecto y escribe:

> Lee INSTRUCTIVO_NUEVO_PROYECTO.md y montemos el proyecto para la empresa nueva.

Tiempo estimado: 1–2 h la primera vez (sin contar la revisión de las fichas del cliente).

---

## Para Claude (leer antes de hacer nada)

Estás en un laptop nuevo. **No tienes memoria de las sesiones anteriores**: todo lo que necesitas saber está en este archivo y en `CLAUDE.md`. Ojo: `CLAUDE.md` describe el proyecto de **D'Vida** (el original); trátalo como documentación del sistema, no como datos de esta empresa. En la Parte 9 lo adaptas.

### Cómo trabajar

1. **Primero pregunta, después actúa.** Antes de tocar archivos, pide los datos de la tabla "Datos que hay que pedir" (usa `AskUserQuestion` en tandas de hasta 4). Lo que el usuario no tenga todavía, déjalo marcado como pendiente y sigue con lo que no dependa de eso.
2. **Sigue las partes en orden** y al terminar cada una di qué quedó hecho y qué falta. Lleva la lista de la sección "Checklist final".
3. **Verifica antes de afirmar.** Cada parte tiene un "Comprobar": córrelo y muestra el resultado.
4. **Pide confirmación antes de cualquier cosa difícil de deshacer o visible para terceros:** `supabase db push`, `git push`, activar Pages, crear usuarios, borrar archivos fuera de la lista de la Parte 2.
5. **Si algo no cuadra con este documento** (un archivo que no existe, un comando que falla), no improvises un rodeo: explica qué encontraste y pregunta.

### Lo que nunca se hace

- ❌ Poner la `service_role` / `secret` key de Supabase en el repo, en `site_config.json`, en el código o en un commit. Solo va la `anon` key (es pública a propósito; la protege RLS). La `service_role` solo puede vivir en `.env.test` (ignorado por git) para tests locales.
- ❌ Tocar el proyecto Supabase de D'Vida (`qgxvukllzuaiyhzegaef`) ni el repo `dvida-rpci/dvida-qr`. Si ves ese ref o ese repo en algún archivo, es un resto que hay que reemplazar.
- ❌ Hacer `git push` al remote antes de confirmar que `origin` es el repo de la empresa nueva (`git remote -v`).
- ❌ Borrar `sabana_base.xlsx`: es la biblioteca de mantenimiento reutilizable, no un dato de D'Vida.

### Preferencias del usuario (vienen de las sesiones anteriores)

- Idioma español en todo: respuestas, logs, docstrings, commits. Logs con emojis (📖 📊 ✅ ❌ 🏗️).
- Rama `master`, nunca `main`.
- **Celular primero:** toda pantalla del sitio o de la GUI se prueba a 360 y 390 px antes que en escritorio ("si no se ve bien en el celular los técnicos no lo van a usar"). Lo más relevante arriba, listas de a 10 con "Cargar más", del 4.º elemento en adelante plegado con chevron, nada de etiquetas cortadas.
- Autor de los commits: el usuario de git configurado en ese laptop (Parte 1).

### Datos que hay que pedir

| # | Dato | Ejemplo | Dónde se usa |
|---|------|---------|--------------|
| 1 | Nombre corto de la empresa / planta | `Lácteos Norte — PTAR Rionegro` | Títulos del sitio, nombre del repo |
| 2 | Título del sitio, título largo y corto del banner | `QR PTAR Lácteos Norte` / `Documentación Técnica — PTAR Rionegro` / `PTAR Rionegro` | `site_config.json` |
| 3 | Cuenta y nombre del repo de GitHub (vacío, ya creado o por crear) | `lacteosnorte/qr-ptar` | remote de git, URL pública, QR |
| 4 | ¿El repo será público o privado? | — | Pages gratis solo en repos públicos (privado requiere plan pago de GitHub) |
| 5 | Project ref de Supabase, URL y `anon` key | `abcd1234…` / `https://abcd1234….supabase.co` | `site_config.json`, `.mcp.json` |
| 6 | Contraseña de la base de Supabase | — | `supabase link` (pedirla en el momento; no guardarla en archivos) |
| 7 | Excel de fichas técnicas del cliente | `NIxxxxx Fichas Técnicas.xlsx` | Parte 4 |
| 8 | Logo del cliente (PNG) y URL de su página | `https://lacteosnorte.com` | `docs/assets/logos/LogoCliente.png`, `logos.right_href` |
| 9 | ¿Se mantiene el logo izquierdo de RPCI? | Sí → `LogoRPCI.png` | `logos.left*` |
| 10 | Color del tema | `#0f766e` | GUI → color picker |
| 11 | Personas que usarán el histórico: nombre, correo y rol (`tecnico` / `oficina`) | — | Parte 3.4 |
| 12 | ¿Dominio propio? | `qr.lacteosnorte.com` | `docs/CNAME` (opcional) |

---

## Parte 0 — Llevar el código al laptop nuevo

El repo de D'Vida está en otra cuenta de GitHub, así que **no se clona**: se empaqueta desde el laptop actual y se copia. `git archive` toma solo lo que está commiteado (deja fuera `.git`, `.env`, `.env.test`, `.claude/` y archivos sin seguimiento).

**En el laptop actual (donde está D'Vida):**

```bash
cd ~/google-sites-migrator
git status                                   # si hay cambios sin commitear que quieras llevar, commitéalos antes
git archive --format=tar.gz -o ~/qr-base.tar.gz HEAD
```

Copia `qr-base.tar.gz` al laptop nuevo (USB, Drive, correo). En Windows, ponlo en `Descargas`.

**En el laptop nuevo, dentro de WSL:**

```bash
mkdir -p ~/proyectos/qr-<empresa> && cd ~/proyectos/qr-<empresa>
tar -xzf /mnt/c/Users/<usuario-windows>/Downloads/qr-base.tar.gz
git init -b master                           # historial limpio: el de D'Vida no viaja
```

> ⚠️ Trabaja siempre dentro del disco de WSL (`~/...`), **nunca en `/mnt/c/...`**: desde ahí Python y git son mucho más lentos, y los `.sh` se rompen por permisos y saltos de línea (CRLF).

**Comprobar:** `ls` muestra `gui.py`, `excel_migrator.py`, `supabase/migrations/` y `sabana_base.xlsx`; `git status` muestra todo como archivos nuevos.

---

## Parte 1 — Preparar el laptop (WSL Ubuntu)

Si WSL no está instalado: en PowerShell como administrador, `wsl --install -d Ubuntu`, reiniciar y crear el usuario de Ubuntu.

```bash
sudo apt update && sudo apt install -y python3 python3-pip git curl
pip3 install --break-system-packages -r requirements.txt     # nicegui, openpyxl, python-multipart, supabase, Pillow

git config --global user.name  "<Nombre Apellido>"
git config --global user.email "<gmail de la empresa nueva>"
git config --global init.defaultBranch master
git config --global core.autocrlf input
```

> `CLAUDE.md` menciona solo `openpyxl nicegui`; **usa `requirements.txt`**: la GUI también necesita `supabase`, `Pillow` y `python-multipart`.

**CLI de GitHub y de Supabase**, con sesión **solo en las cuentas de la empresa nueva** (en este laptop no deberían existir credenciales de D'Vida):

```bash
# gh: https://github.com/cli/cli/blob/trunk/docs/install_linux.md
gh auth login

# supabase CLI: https://supabase.com/docs/guides/cli/getting-started (paquete .deb de las releases)
supabase login
```

**Opcional — Docker Desktop** (con "WSL integration" activada): solo se necesita para `supabase start` y los tests de RLS en local. Para generar el sitio y publicarlo no hace falta.

**Comprobar:**

```bash
python3 --version                                            # 3.10 o mayor
python3 -c "import nicegui, openpyxl, supabase, PIL; print('ok')"
gh auth status && supabase projects list                     # deben mostrar la cuenta y el proyecto NUEVOS
```

---

## Parte 2 — Quitar todo lo de D'Vida

Estos archivos son datos o configuración de D'Vida. Si se quedan, terminan publicados o se usan por error.

```bash
# Datos del cliente anterior (NO borrar sabana_base.xlsx)
rm -f plantilla_sitio.xlsx TAG_RESOURCES.xlsx fichas_source.xlsx
ls *.xlsx                                    # debe quedar solo sabana_base.xlsx

# Sitio generado y fotos de los TAGs anteriores
rm -rf docs/equipos docs/instrumentos docs/tanques
rm -rf docs/assets/images/*
rm -f  docs/CNAME                            # dominio de D'Vida: si queda, Pages intenta servir ese dominio
rm -f  docs/*.html docs/urls.txt docs/search-index.* docs/migration_metadata.json docs/README.md
```

Luego, a mano (Claude lo hace con Edit):

| Archivo | Qué cambiar |
|---------|-------------|
| `site_config.json` | Todo: títulos, `site_url`, logos, `supabase` (ver Parte 4.1). Tiene datos de D'Vida. |
| `.mcp.json` | `project_ref=qgxvukllzuaiyhzegaef` → ref nuevo. Es el conector MCP de Supabase para Claude. |
| `excel_migrator.py` (`SITE_URL`) | URL de fallback `jagilren.github.io/groupe_seb_qr` → `https://<cuenta>.github.io/<repo>/` |
| `gui.py` (`cfg.setdefault("site_url", ...)` y el placeholder `alimentosdvida`) | Igual: URL nueva y ejemplo neutro |
| `update_site_from_excel.sh` (el `echo 🌐 ...` del final) | URL nueva |
| `windows_launchers/Lanzar_QR_App_WSL.bat` | `WSL_USER` y `PROJECT_DIR_WSL` → usuario de Ubuntu y ruta del proyecto en este laptop; revisar `WSL_DISTRO` (`wsl -l -v` en PowerShell) |
| `docs/assets/logos/` | `LogoCliente.png` → logo nuevo; `LogoRPCI.png` se queda si el dato 9 es "sí" |

`docs/superpowers/` contiene los specs y planes con que se construyó el sistema; se publica en Pages porque está dentro de `docs/`. Pregúntale al usuario si lo deja (documenta el sistema) o lo borra. `CLAUDE.md` se adapta en la Parte 9.

**Comprobar** (no debe quedar nada fuera de `CLAUDE.md`, `docs/superpowers/` y este instructivo):

```bash
grep -rniI "dvida\|d'vida\|qgxvukllzuaiyhzegaef\|groupe_seb\|alimentosdvida\|STARnD\|google-sites-migrator" . \
  --exclude-dir=.git --exclude-dir=superpowers --exclude=CLAUDE.md --exclude=INSTRUCTIVO_NUEVO_PROYECTO.md
```

Los tests (`tests/`) pueden nombrar "dvida" en nombres de funciones de ejemplo; eso es inofensivo.

---

## Parte 3 — Supabase de la empresa nueva

### 3.1 Datos del proyecto

En https://supabase.com con la cuenta nueva → el proyecto ya creado:

- **Project ref:** la parte inicial de la URL, `https://<ref>.supabase.co`.
- **Project Settings → API:** `Project URL` y la key **anon / publishable**.
- La **contraseña de la base**, la que se eligió al crear el proyecto (si se perdió: *Project Settings → Database → Reset database password*).

### 3.2 Aplicar el esquema (tablas, RLS, bucket, plan de mantenimiento)

En un proyecto **nuevo y vacío**, el script aplica las 12 migraciones de `supabase/migrations/` en orden:

```bash
chmod +x *.sh
./setup_supabase_planta.sh <ref>             # pide confirmar el ref; luego supabase link (pide la contraseña) + db push
```

> La advertencia del script ("no usar en DVida") es solo para el proyecto de D'Vida, cuyas migraciones se aplicaron a mano. En un proyecto nuevo es el camino correcto.

Crea `profiles`, `maintenance_records`, `maintenance_attachments`, `maintenance_comments`, `maintenance_audit_log`, `equipment_classes`, `maintenance_activities`, `equipment_tags`, `maintenance_record_activities`, `maintenance_manual_schedule`, las vistas `author_names`, `maintenance_schedule` y `maintenance_agenda`, el bucket privado `maintenance-attachments` y todas las políticas RLS. No hay que crear nada a mano.

**Comprobar** (debe decir `tablas: 10`, `vistas: 3`, `bucket: 1`):

```bash
supabase db query --linked "select
  (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name in ('profiles','maintenance_records','maintenance_attachments','maintenance_comments','maintenance_audit_log','equipment_classes','maintenance_activities','equipment_tags','maintenance_record_activities','maintenance_manual_schedule')) as tablas,
  (select count(*) from information_schema.views where table_schema='public' and table_name in ('author_names','maintenance_schedule','maintenance_agenda')) as vistas,
  (select count(*) from storage.buckets where id='maintenance-attachments') as bucket"
```

### 3.3 Cerrar el auto-registro

Dashboard → **Authentication → Sign In / Providers → Email** → desactivar **"Allow new users to sign up"** (el nombre exacto puede variar según la versión del panel). Sin esto, cualquiera con la `anon` key (que es pública en el sitio) puede crearse una cuenta. Esas cuentas no pueden escribir porque no tienen perfil, pero es mejor no tenerlas. Es un paso del panel: Claude se lo indica al usuario y espera confirmación.

### 3.4 Usuarios y perfiles

Por cada persona del dato 11:

1. **Authentication → Users → Add user → Create new user**: correo y contraseña, marcar **Auto Confirm User**.
2. Darle perfil y rol:

```bash
supabase db query --linked "insert into public.profiles (user_id, full_name, role)
  select id, 'Nombre Apellido', 'tecnico' from auth.users where email = 'persona@empresa.com'"
```

Sin la fila de `profiles` el usuario inicia sesión pero **no puede registrar nada**.

| Rol | Puede |
|-----|-------|
| `tecnico` | Desde la ficha del sitio: registrar mantenimientos y agregar comentarios/adjuntos a los **suyos**. No edita ni borra. |
| `oficina` | Todo lo anterior + editar y borrar registros, manejar la sábana, asignar equipos y reprogramar desde `gui.py`. |

Al menos una cuenta de cada rol. Las contraseñas van en un gestor de contraseñas, nunca en el repo.

### 3.5 Backups

El histórico vive solo en Supabase. Revisa en *Database → Backups* qué incluye el plan de la cuenta y, si no hay backups automáticos, acuerda con el usuario una exportación periódica.

### 3.6 Conector MCP (opcional, para que Claude consulte la base)

Con `.mcp.json` ya apuntando al ref nuevo (Parte 2), el usuario autoriza el servidor con `/mcp` en Claude Code, usando la cuenta de Supabase de la empresa nueva.

---

## Parte 4 — Configurar el sitio y cargar los TAGs

### 4.1 `site_config.json`

La GUI solo cambia título, color, logo del cliente y su enlace. **El resto se edita a mano:**

```json
{
  "site_title": "QR <Empresa>",
  "banner_title_full": "Documentación Técnica — <Planta>",
  "banner_title_short": "<Planta>",
  "site_url": "https://<cuenta>.github.io/<repo>/",
  "theme": { "...": "lo genera la GUI desde el color elegido" },
  "logos": {
    "left": "assets/logos/LogoRPCI.png", "left_alt": "RPCI", "left_href": "https://rpci.com.co",
    "right": "assets/logos/LogoCliente.png", "right_alt": "<Empresa>",
    "right_href": "https://<sitio-de-la-empresa>"
  },
  "supabase": {
    "url": "https://<ref>.supabase.co",
    "anon_key": "<anon key del proyecto NUEVO>"
  }
}
```

- Si faltan `banner_title_*`, el sitio usa los de D'Vida ("PTAR STARnD").
- `site_url` gobierna el banner y el README. Los QR (`urls.txt`) **no** lo usan: salen del remote de git.
- URL y `anon_key` tienen que ser del **mismo** proyecto. Mezclarlas es el error más común: el login falla con "Invalid API key".

### 4.2 Conectar el remote antes de generar

```bash
git remote add origin https://github.com/<cuenta>/<repo>.git
git remote -v                                # confirmar que es el repo de la empresa nueva
```

Si el repo no existe: `gh repo create <cuenta>/<repo> --public` (o `--private`, ver dato 4). Debe estar **vacío** (sin README).

### 4.3 Revisar el Excel de fichas antes de convertir

- **Una hoja por TAG**, con nombre que cumpla `^\d{3}-[A-Z]+-` (p. ej. `100-P-01A`). Las demás hojas se ignoran.
- Hojas con varios TAGs se expanden: `100-P-01 A_B` → `100-P-01A` y `100-P-01B`.
- La categoría sale del tipo del TAG (mapeo en `convert_fichas_to_template.py`): `TK|R|F|SD` → TANQUES, `P|MX|M|C|PS` → EQUIPOS, `AIT|FIT|SV|LT` → INSTRUMENTOS. **Un tipo que no esté ahí (p. ej. `HX`, `B`) no cae en ninguna categoría.** Claude debe listar los tipos presentes en el Excel, compararlos con el mapeo y preguntar al usuario la categoría de los que falten antes de convertir.
- Layout `ETIQUETA | VALOR` por fila. El campo `SERVICIO` da el nombre del título y del buscador.
- Los logos del encabezado del Excel se filtran solos (filas 1–3 y ≤5 filas de alto); las fotos de equipos se conservan.

### 4.4 Generar el sitio

**Con la GUI** (recomendado): `./launch_gui.sh` → http://localhost:8080 (desde WSL, el navegador de Windows abre `localhost` sin problema). Sube el Excel de fichas y el logo, ajusta título y color, y pulsa **Generar sitio**. Como no hay plantilla, la conversión corre con el Excel subido.

**Con la línea de comandos:**

```bash
python3 convert_fichas_to_template.py "<fichas>.xlsx"   # plantilla_sitio.xlsx + imágenes en docs/assets/images/<TAG>/
python3 generate_tag_resources_template.py             # TAG_RESOURCES.xlsx con una fila por TAG
python3 excel_migrator.py plantilla_sitio.xlsx docs/
```

`TAG_RESOURCES.xlsx` (botones Especificaciones / Manual / Mantenimiento) se llena después, a mano en Excel: en cada celda, `Ctrl+K` y pegar el enlace. Escribir la URL como texto plano puede no funcionar.

**Comprobar:** el log muestra el número de TAGs esperado y su reparto por categoría; `docs/urls.txt` tiene URLs con `https://<cuenta>.github.io/<repo>/`.

---

## Parte 5 — Plan de mantenimiento (sábana)

Requiere un usuario `oficina` (Parte 3.4) y el sitio generado (los TAGs salen de `plantilla_sitio.xlsx`).

1. `gui.py` → **📋 Plan de mantenimiento** → iniciar sesión con `oficina`.
2. Pestaña **📋 Sábana → 📥 Importar sábana base**: carga clases y actividades desde `sabana_base.xlsx`.
3. Pestaña **⚙️ Equipos → 🪄 Auto-asignar**: propone la clase de cada TAG (por la letra del TAG y palabras clave del tipo/servicio) y detecta los pares A/B.
4. Revisar con el usuario el **régimen** de cada par A/B (`normal`, `alterna`, `principal`, `reserva`) y las horas/día de cada clase.

> ⚠️ Las frecuencias de `sabana_base.xlsx` son **de ejemplo**. Hay que validarlas con la empresa o con los manuales del fabricante antes de confiar en los "vencidos".

**Comprobar:** pestaña **📅 Agenda** con actividades programadas; en el sitio, una ficha muestra las pestañas Programados / Realizados / Plan.

---

## Parte 6 — Probar en local antes de publicar

1. En la GUI, **Ver sitio** (http://localhost:8190), o `cd docs && python3 -m http.server 8190`.
2. Revisa: cantidad de TAGs, títulos, imágenes, buscador, colores, logos y `mantenimientos.html`.
3. **Celular primero:** revisa inicio, una ficha y `mantenimientos.html` a 360 y 390 px (DevTools del navegador → modo dispositivo, o la skill `browser-automation` de Claude). Sin desborde horizontal ni etiquetas cortadas.
4. Abre una ficha → inicia sesión con el `tecnico` → registra un mantenimiento de prueba con una foto. Si guarda, la conexión con el Supabase nuevo está bien.
5. En la GUI → **🧰 Mantenimientos** con `oficina`: confirma que ves el registro y bórralo (es de prueba). La foto queda en el bucket como evidencia; es normal.

---

## Parte 7 — Publicar

1. `git add -A && git commit -m "feat: proyecto inicial <empresa>"`. Antes, revisa `git status`: no debe aparecer `.env`, `.env.test` ni ningún archivo con la `service_role`.
2. Con confirmación del usuario: `git push -u origin master`.
3. En GitHub → **Settings → Pages → Source: Deploy from a branch → `master` / `/docs`**. No se hereda: hay que hacerlo en cada repo. (Equivalente: `gh api -X POST repos/<cuenta>/<repo>/pages -f "source[branch]=master" -f "source[path]=/docs"`.)
4. Espera 1–2 min: `gh api repos/<cuenta>/<repo>/pages/builds/latest --jq .status` debe decir `built`.
5. Abre `https://<cuenta>.github.io/<repo>/` y repite la prueba de login e historial.
6. **Dominio propio (opcional, dato 12):** crear `docs/CNAME` con el dominio, apuntar el DNS y activarlo en Settings → Pages.

---

## Parte 8 — QR

`docs/urls.txt` trae una línea por TAG (`CATEGORIA,URL`) con la URL final, derivada del remote de git. **Genera e imprime los QR solo al final**, con el repo definitivo ya publicado: si después cambia el repo, los stickers quedan apuntando mal.

---

## Parte 9 — Dejar el proyecto listo para futuras sesiones de Claude

1. **Adaptar `CLAUDE.md`** a la empresa nueva:
   - Remote, URL "Live", cliente y Excel de origen.
   - Quitar o reescribir lo específico de D'Vida: la línea "Producción (`qgxvukllzuaiyhzegaef`)…", la advertencia de "no usar `setup_supabase_planta.sh` en DVida", las rutas de migraciones aplicadas con `psql` y la tabla "Estado de archivos".
   - Anotar el project ref nuevo y qué migraciones tiene aplicadas (todas, vía `db push`). Las migraciones futuras en esta empresa sí van con `supabase db push`.
   - Ruta de Node si se usan los tests JS (en el laptop original estaba en `~/.codegpt/bin/node`; aquí puede ser otra).
2. **Memoria de Claude:** guardar en la memoria del proyecto (no en el repo) qué cuenta de Supabase/GitHub es la de esta empresa y las preferencias de la sección "Para Claude".
3. Commit de `CLAUDE.md`.

---

## Checklist final

- [ ] Código copiado con `git archive`, `git init -b master` hecho, trabajando en `~/...` (no `/mnt/c`)
- [ ] Dependencias de `requirements.txt` instaladas; `gh` y `supabase` con sesión en las cuentas **nuevas**
- [ ] Sin restos de D'Vida (grep de la Parte 2 limpio); `sabana_base.xlsx` conservado
- [ ] `.mcp.json`, URLs de fallback y lanzador `.bat` actualizados
- [ ] Migraciones aplicadas: `tablas: 10`, `vistas: 3`, `bucket: 1`
- [ ] Auto-registro desactivado en Supabase
- [ ] Al menos un usuario `tecnico` y uno `oficina`, cada uno con su fila en `profiles`
- [ ] `site_config.json` con URL y `anon_key` del proyecto **nuevo** y títulos de la empresa
- [ ] Sitio generado con el número correcto de TAGs; tipos de TAG nuevos agregados al mapeo
- [ ] Sábana importada, equipos asignados y regímenes A/B revisados
- [ ] Prueba local de historial hecha, revisión a 360/390 px hecha
- [ ] Publicado: Pages en `master` `/docs`, prueba de historial en producción hecha
- [ ] `CLAUDE.md` adaptado a la empresa nueva
- [ ] QR generados desde `urls.txt` del repo definitivo

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| El sitio muestra TAGs de D'Vida | Quedó `plantilla_sitio.xlsx` o un xlsx viejo en la raíz | Borrarlos (Parte 2) y volver a convertir |
| Login: "Invalid API key" / no conecta | `url` y `anon_key` de proyectos distintos, o falta regenerar | Corregir `site_config.json` y regenerar (la config se inyecta al generar) |
| Login funciona pero no deja registrar | El usuario no tiene fila en `profiles` | Parte 3.4 |
| "relation ... does not exist" | No se aplicaron las migraciones | Parte 3.2 |
| `supabase link` / `db push` contra el proyecto equivocado | El CLI tiene sesión en otra cuenta | `supabase logout && supabase login` con la cuenta nueva |
| Pages en blanco / 404 | Pages apunta a la raíz, quedó `docs/CNAME` viejo o repo privado sin plan pago | Pages → `/docs`; borrar `docs/CNAME`; revisar visibilidad |
| El banner dice "PTAR STARnD" | Faltan `banner_title_*` en `site_config.json` | Agregarlos y regenerar |
| Un TAG no aparece | Nombre de hoja fuera de `^\d{3}-[A-Z]+-` o tipo sin categoría | Renombrar la hoja o agregar el tipo al mapeo |
| Fotos que no corresponden | Quedaron fotos viejas en `docs/assets/images/` | Vaciarla y re-extraer con `--images-only` |
| `./launch_gui.sh: Permission denied` o `\r: command not found` | Archivos copiados desde Windows (permisos/CRLF) | `chmod +x *.sh` y `sed -i 's/\r$//' *.sh` |
| La GUI no abre desde el acceso directo de Windows | `WSL_USER` / `PROJECT_DIR_WSL` del `.bat` apuntan al laptop viejo | Parte 2, fila del lanzador |
| "Importar sábana base" no deja | Sesión sin rol `oficina` | Entrar con un usuario `oficina` |

## Cuando el proyecto ya está en marcha

- **Actualizar fichas:** GUI con el switch **🔄 Forzar regeneración** y el xlsx nuevo, o `./update_site_from_excel.sh --from-fichas --push`.
- **Agregar TAGs nuevos al Excel:** no afecta a los mantenimientos cargados. El TAG nuevo arranca sin historial; no hay que darlo de alta en la base. Para el plan, asignarle clase en **⚙️ Equipos**.
- **⚠️ Renombrar o borrar un TAG del Excel:** el mantenimiento se empareja con la ficha por el **texto exacto** del TAG. Si cambias `100-P-01A` por `100-P-1A`, la ficha nueva aparece vacía y los registros viejos quedan huérfanos (solo se ven en la pestaña **Todos** de `mantenimientos.html`). Si hay que renombrar, actualiza también la base (con backup):

  ```sql
  update public.maintenance_records set tag_id = '<TAG nuevo>' where tag_id = '<TAG viejo>';
  update public.equipment_tags      set tag_id = '<TAG nuevo>' where tag_id = '<TAG viejo>';
  update public.maintenance_manual_schedule set tag_id = '<TAG nuevo>' where tag_id = '<TAG viejo>';
  ```

- **Migraciones nuevas del sistema** (cuando se agreguen a `supabase/migrations/` en cualquiera de los proyectos): copiar el archivo a este repo y `supabase db push`; solo se aplican las que falten.
- **Cuentas nuevas:** repetir la Parte 3.4.
