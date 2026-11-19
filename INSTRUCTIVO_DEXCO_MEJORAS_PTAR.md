# Instructivo: proyecto QR "DEXCO Mejoras PTAR"

Pasos para montar el sitio de fichas técnicas con QR + mantenimientos (Supabase) para **DEXCO Mejoras PTAR**, partiendo del proyecto de **FANALCA** (`fanalca-rpci/fanalca-rpci`).

> **Documento vivo.** Se escribe mientras se monta FANALCA (noviembre 2026). Lo marcado **✅ validado** ya se hizo de punta a punta en FANALCA; lo marcado **⏳** todavía no, y mientras tanto se sigue la parte equivalente de [INSTRUCTIVO_NUEVO_PROYECTO.md](INSTRUCTIVO_NUEVO_PROYECTO.md).

**Cómo usarlo:** abrir Claude Code en la carpeta del proyecto nuevo y escribir:

> Lee INSTRUCTIVO_DEXCO_MEJORAS_PTAR.md y montemos el proyecto DEXCO Mejoras PTAR.

**Regla de oro:** un proyecto = un repo de GitHub + un proyecto de Supabase + una cuenta de Gmail. Nada se comparte con FANALCA ni con D'Vida. Los mantenimientos se guardan por TAG en texto: si dos plantas comparten base, un `100-P-01A` de una se mezcla con el de la otra.

**Tiempo en FANALCA:** ~3 h hasta el sitio publicado con logo y colores (sin contar Supabase ni usuarios). **Meta en DEXCO: la mitad**, siguiendo la ruta rápida.

## Ruta rápida (en orden; el detalle está en cada parte)

| # | Paso | Quién | Parte |
|---|---|---|---|
| 1 | Pedir los datos: Gmail, repo GitHub (público), Supabase (ref, URL, anon key), carpeta de fichas, web del cliente, personas y perfiles | Claude pregunta | 0 |
| 2 | Revisar herramientas y avisar lo que falte (CLI Supabase **completa**, `gh`, sesiones) | Claude | 1 |
| 3 | Clonar el código de FANALCA sin `.git`, `git init -b master` | Claude | 2 |
| 4 | `gh auth login` y `supabase login` con las cuentas de DEXCO | **Usuario** (abre navegador) | 3 |
| 5 | Quitar datos de FANALCA (Excel, fichas, fotos, `assets/fichas/`, logos, `TAG_RESOURCES.xlsx`) y reemplazar URLs | Claude | 4 |
| 6 | Buscar el **Excel** de fichas (no los PDF), revisar hojas y convertir | Claude | 5 |
| 7 | Logo y colores desde la web del cliente; logo **a color** para el QR (`LogoQR.png`) | Claude | 6, 9.6 |
| 8 | `site_config.json`, `git remote`, generar, revisar a 360/390 px | Claude | 6 |
| 9 | Crear repo, push, activar Pages; comprobar Actions | Claude (con confirmación) | 7, 10 |
| 10 | `supabase link` (pide contraseña) | **Usuario** | 8.1 |
| 11 | `supabase db push --linked --yes` (todas las migraciones) + `functions deploy admin-users --use-api` + sembrar `site_settings` | Claude | 8.1, 9.6 |
| 12 | Cerrar auto-registro; crear el primer usuario oficina y darle perfil | **Usuario** + Claude | 8.2 |
| 13 | **Fichas PDF por TAG y manuales** del fabricante (solo enlaces verificados) | Claude | 9.6 ⚠️ |
| 14 | Desde `/admin/`: 📥 Importar rutinas base → 🪄 Auto-asignar → revisar | **Usuario** (celular) o Claude | 9.4, 9.6 |
| 15 | Prueba en el celular: usuario de prueba, registrar, foto, QR T-Card impresa y escaneada | **Usuario** | 9.6 |
| 16 | Adaptar `CLAUDE.md` a DEXCO y guardar las cuentas en la memoria de Claude | Claude | 11 |

---

## Para Claude (leer antes de hacer nada)

- `CLAUDE.md` describe el sistema (escrito para D'Vida). Úsalo como documentación técnica, no como datos de DEXCO.
- **Primero revisa las herramientas (Parte 1) y avisa al usuario de lo que falte** — CLIs, sesiones, MCPs, skills — antes de llegar al paso que lo necesita. Es una preferencia explícita del usuario.
- **Pregunta primero, actúa después.** Pide los datos de la Parte 0 con `AskUserQuestion`. Lo que falte queda pendiente y se sigue con lo que no dependa de eso.
- **Pide confirmación** antes de: crear el repo, el primer `git push`, activar Pages, aplicar migraciones, crear usuarios.
- **Nunca** pongas la `service_role` / `secret` key de Supabase en el repo ni en `site_config.json`. Solo la `anon` key.
- **Nunca** manejes contraseñas del usuario: los pasos que piden la contraseña de la base (`supabase link`) los corre el usuario en su terminal.
- **Antes de cada commit, mira `git status` completo** — no hagas `git add -A` a ciegas. En FANALCA se subieron dos documentos del cliente (`Assets/Mantenimiento/`) sin revisarlos; el usuario decidió dejarlos públicos, pero debió decidirlo antes.
- **Después de cada push**, confirma el Action de Pages con **un solo** comando en segundo plano y reporta una línea (ver Parte 10). No hagas polling ni leas logs salvo que falle.
- Español en todo. Rama `master`.
- **Celular primero, siempre.** Los técnicos registran todo desde el celular. Toda pantalla nueva (sitio, administración, formularios) se diseña para celular y se prueba a 360 y 390 px antes que en escritorio: botones grandes, lo importante arriba, nada cortado, búsqueda por TAG a mano.
- **Borrar con rutas absolutas.** La protección de Claude Code bloquea `rm -rf carpeta/*` después de un `cd`. Usa `rm -rf "/home/<usuario>/<proyecto>/docs/assets/images"` y luego `mkdir -p`.

---

## Parte 0 — Datos que hay que pedir

| # | Dato | FANALCA (referencia) | DEXCO |
|---|------|----------------------|-------|
| 1 | Correo Gmail del proyecto | `fanalca.rpci@gmail.com` | _pendiente_ |
| 2 | Cuenta y repo de GitHub (**público**: Pages gratis) | `fanalca-rpci/fanalca-rpci` | _pendiente_ |
| 3 | Supabase: project ref, Project URL, **anon key** (JWT `eyJ…`, en Project Settings → API → "Legacy anon key"; la `sb_publishable_…` también existe, pero el código está probado con la anon) | `bcpthbpbyyrlemvbrshp` | _pendiente_ |
| 4 | Ruta de la carpeta de fichas técnicas | `D:\Proyectos con Ingenieria SAS\Proyectos - General\NP00043 STARD Fanalca\INGENIERIA\2. Fichas téc` | _pendiente_ |
| 5 | Títulos: sitio, banner largo, banner corto | `QR PTAR FANALCA` / `Documentación Técnica — PTAR FANALCA` / `PTAR FANALCA` | `QR DEXCO Mejoras PTAR` / … (confirmar) |
| 6 | Página web del cliente (de ahí sale el logo y los colores) | `https://fanalca.com/` | _pendiente_ |
| 7 | Personas: nombre, correo, rol (`tecnico` / `oficina`) | _pendiente_ | _pendiente_ |
| 8 | Documentos de mantenimiento del cliente (plan, manual) | `MP-02 .xls`, `MP-03 .docx` en `Assets/Mantenimiento/` (públicos en el repo, por decisión del usuario) | ¿públicos o fuera de git? |

**Comprobar la anon key** antes de usarla: el payload del JWT (segunda parte, base64) debe decir `"ref":"<project ref>"` y `"role":"anon"`. Si el `ref` no coincide con la URL, el login falla con "Invalid API key".

---

## Parte 1 — Herramientas: qué tiene que haber en el laptop

Claude revisa esto al inicio y avisa lo que falte. En el laptop de FANALCA ya estaba todo lo marcado ✅.

| Herramienta | Para qué | Comprobar | Instalar / configurar |
|---|---|---|---|
| ✅ Python 3.12 + `requirements.txt` + `requirements-dev.txt` | Generar el sitio, GUI, tests | `python3 -c "import nicegui, openpyxl, supabase, PIL, pytest"` | `pip3 install --break-system-packages -r requirements.txt -r requirements-dev.txt` |
| ✅ Node 22 | Tests JS | `node --version` | — |
| ✅ `gh` (GitHub CLI) | Crear repo, push, Pages, Actions | `gh --version` | `sudo apt install gh` |
| ✅ `supabase` CLI **completo** | Aplicar migraciones | `supabase link --help` debe mostrar "Link to a Supabase project" (no basta `--version`) | Ver nota "CLI de Supabase" abajo |
| ✅ `rsync`, `unzip`, `curl` | Copiar código, leer hojas del Excel, bajar el logo | `which rsync unzip curl` | `sudo apt install -y rsync unzip curl` |
| ✅ Chromium headless | Capturas a 390/1280 px para revisar el sitio | `ls ~/.cache/ms-playwright/` | `npx playwright install chromium-headless-shell` |
| ✅ `xlrd` | Leer el programa de mantenimiento del cliente si viene en `.xls` viejo (openpyxl no lo abre) | `python3 -c "import xlrd"` | `pip3 install --break-system-packages xlrd` |
| ☐ Docker | Solo para tests de RLS en local (`supabase start`) | `docker info` | Docker Desktop con WSL integration |
| ☐ **Sesión `gh` con la cuenta de DEXCO** | Push al repo correcto | `gh auth status` | Parte 3.1 (la hace el usuario: abre navegador) |
| ☐ **Sesión `supabase` con la cuenta de DEXCO** | Migraciones | `supabase projects list` muestra el ref de DEXCO | `supabase login` (la hace el usuario) |

**CLI de Supabase (problema real en FANALCA).** La versión 2.109.x instalada como un solo archivo en `~/.local/bin/supabase` es solo un *lanzador*: `projects list` y `--version` funcionan, pero `link` / `db push` fallan con *"for `supabase-go` in: … not found alongside the shim"*. Instalar el paquete completo (lanzador + `supabase-go` juntos) y ponerlo primero en el PATH:

```bash
mkdir -p "$HOME/.local/share/supabase"
curl -sL https://github.com/supabase/cli/releases/download/v2.109.1/supabase_2.109.1_linux_amd64.tar.gz \
  | tar -xzf - -C "$HOME/.local/share/supabase"
echo 'export PATH="$HOME/.local/share/supabase:$PATH"' >> ~/.bashrc     # lo hace el usuario
source ~/.bashrc
supabase link --help | head -3
```

Claude no tiene permiso para editar `~/.bashrc`: esa línea la agrega el usuario.

**MCPs (conectores de Claude):**

| MCP | Estado en FANALCA | Qué hacer en DEXCO |
|---|---|---|
| Supabase de claude.ai | Conectado, pero a **otra** cuenta: `get_project` → *"You do not have permission"* | No sirve para DEXCO salvo que se conecte con la cuenta de DEXCO. Usar el CLI. |
| Supabase por proyecto (`.mcp.json`) | **No vino en el código** (no estaba commiteado en D'Vida) | Opcional. Crear `.mcp.json` con `{"mcpServers":{"supabase":{"type":"http","url":"https://mcp.supabase.com/mcp?project_ref=<ref>"}}}` y autorizar con `/mcp` usando la cuenta de DEXCO. Sirve para que Claude consulte la base sin pedir comandos. |
| Claude in Chrome | Disponible | Opcional, para revisar el sitio publicado. |

**Skills / plugins:** el plugin **superpowers** (brainstorming, planes, TDD) ya está instalado. `CLAUDE.md` menciona una skill `browser-automation` que **no existe** en este laptop: en su lugar se usa Chromium headless directo (Parte 6.4).

---

## Parte 2 — Traer el código ✅ validado

El código base es el de **FANALCA** (ya trae los arreglos de esta guía). Se clona en una carpeta temporal y se copia **sin `.git`**:

```bash
cd ~
git clone https://github.com/fanalca-rpci/fanalca-rpci.git qr-base-tmp
mkdir -p ~/DEXCO_QR_New
rsync -a --exclude='.git' --exclude='Assets/' ~/qr-base-tmp/ ~/DEXCO_QR_New/
cd ~/DEXCO_QR_New && git init -b master
rm -rf ~/qr-base-tmp
```

- `--exclude='Assets/'` deja fuera los documentos de mantenimiento de FANALCA.
- Trabajar siempre en el disco de WSL (`~/…`), **nunca** en `/mnt/c` o `/mnt/d`.

**Comprobar:** `ls` muestra `gui.py`, `excel_migrator.py`, `supabase/`, `sabana_base.xlsx`; `git remote -v` vacío.

---

## Parte 3 — Cuentas ✅ validado

### 3.1 GitHub con una segunda cuenta (la hace el usuario)

```bash
gh auth login --hostname github.com --git-protocol https --web   # entrar con la cuenta de DEXCO
gh auth setup-git
```

Luego Claude, dentro del repo:

```bash
git config user.name  "DEXCO RPCI"
git config user.email "<gmail de DEXCO>"
```

- **HTTPS, no SSH:** la cuenta personal (`jagilren`) usa SSH con su llave; si DEXCO también usara SSH, git subiría con la llave equivocada.
- **Comprobar:** `gh auth status` → DEXCO con `Active account: true`; `git config user.email` → Gmail de DEXCO (sin esto, git firma con el correo global personal).
- Cambiar entre cuentas: `gh auth switch -u <cuenta>`. La activa es la que usa `git push` en **todos** los repos HTTPS.

### 3.2 Supabase (la hace el usuario)

```bash
supabase login
supabase projects list      # debe aparecer el ref de DEXCO, ACTIVE_HEALTHY
```

---

## Parte 4 — Quitar todo lo de FANALCA ✅ validado (con D'Vida)

Con `P=/home/<usuario>/DEXCO_QR_New`:

```bash
rm -f "$P/plantilla_sitio.xlsx" "$P/TAG_RESOURCES.xlsx" "$P/fichas_source.xlsx" \
      "$P"/NP00043*.xlsm "$P"/docs/assets/logos/LogoCliente*.png "$P/docs/CNAME" \
      "$P/docs/urls.txt" "$P/docs/migration_metadata.json" "$P/docs/README.md" \
      "$P/docs/index.html" "$P/docs/mantenimientos.html" "$P"/docs/search-index.*
rm -rf "$P/docs/equipos" "$P/docs/instrumentos" "$P/docs/tanques" "$P/docs/assets/images"
mkdir -p "$P/docs/assets/images"
find "$P" -name "*:Zone.Identifier" -not -path "$P/.git/*" -delete
```

**No borrar** `sabana_base.xlsx` ni `docs/assets/logos/LogoRPCI.png`.

Reemplazar la URL y nombres (cambiar `<cuenta>/<repo>`):

```bash
sed -i 's#https://fanalca-rpci.github.io/fanalca-rpci/#https://<cuenta>.github.io/<repo>/#g' \
  update_site_from_excel.sh comandos.txt gui.py excel_migrator.py
sed -i 's#fanalca-rpci/fanalca-rpci.git#<cuenta>/<repo>.git#g; s#cd fanalca-rpci#cd <repo>#g; s#Fanalca_QR_New#DEXCO_QR_New#g' \
  New_Laptop.txt comandos.txt windows_launchers/*.bat windows_launchers/README.txt
sed -i 's#PTAR FANALCA#DEXCO Mejoras PTAR#g; s#Ej. https://www.fanalca.com#Ej. https://<sitio-dexco>#; s#Ej. QR PTAR FANALCA#Ej. QR DEXCO Mejoras PTAR#' \
  gui.py excel_migrator.py
```

Revisar `WSL_USER` en `windows_launchers/Lanzar_QR_App_WSL.bat` (`whoami`).

**Comprobar:**

```bash
grep -rniIl "fanalca\|bcpthbpbyyrlemvbrshp\|dvida\|qgxvukllzuaiyhzegaef\|groupe_seb" . \
  --exclude-dir=.git --exclude-dir=superpowers --exclude=CLAUDE.md --exclude="INSTRUCTIVO_*.md"
```

Quedan como inofensivos: un comentario en `setup_supabase_planta.sh`, `test_ejemplo_dvida_…` y los filtros `IGNORE_LABELS` de `convert_fichas_to_template.py`.

---

## Parte 5 — Fichas técnicas ✅ validado

### 5.1 Buscar el Excel, no los PDF

En FANALCA las fichas llegaron como **PDF**, pero en la misma carpeta estaba el Excel del que salen (`.xlsm`) y la macro `SHEET2PDF.bas`. **El sistema lee el Excel.** Buscar primero un `.xlsm`/`.xlsx` en la carpeta de fichas. Si solo hay PDF, parar y avisar: hay que pedir el Excel (no existe lector de PDF).

### 5.2 Revisar las hojas

```bash
unzip -p "<fichas>.xlsm" xl/workbook.xml | grep -oP '<sheet [^>]*name="\K[^"]+'
```

- Solo se procesan hojas `^\d{3}-[A-Z]+-`.
- **Pares A/B** → dos TAGs si la hoja termina en `A_B`, `A/B` o `A-B`. `XXX-01_02_03` → 3 TAGs.
- **Categoría:** `TK|R|F|SD` → TANQUES, `P|MX|M|C|PS` → EQUIPOS, `AIT|FIT|SV|LT` → INSTRUMENTOS. Tipo fuera de la lista → preguntar y agregarlo en `convert_fichas_to_template.py`.

### 5.3 Convertir

```bash
cp "/mnt/d/…/<fichas>.xlsm" ~/DEXCO_QR_New/
python3 convert_fichas_to_template.py "<fichas>.xlsm"
python3 generate_tag_resources_template.py
```

Si se reconvierte después de cambiar cómo se separan los TAGs, borrar las carpetas viejas que queden en `docs/assets/images/`.

**Comprobar:** TAGs por categoría y "N TAGs con imágenes". FANALCA: 13 hojas → 15 TAGs (9 equipos, 6 tanques).

---

## Parte 6 — Apariencia y generar el sitio ✅ validado

### 6.1 Logo desde la web del cliente

```bash
curl -sL -A "Mozilla/5.0" https://<sitio-cliente>/ -o /tmp/<scratch>/index.html
grep -oiE '<img[^>]*logo[^>]*>' /tmp/<scratch>/index.html     # buscar class="custom-logo" y variantes
```

Las webs WordPress suelen tener versiones blanco / blanco-azul / color. **Para el banner (fondo oscuro) usar la versión con texto blanco.** Guardar como `docs/assets/logos/LogoCliente.png` (y las otras como `LogoCliente_<variante>.png`). Poner `logos.right_href` = web del cliente.

### 6.2 Colores desde el logo

Sacar los colores dominantes del logo en versión color:

```bash
python3 -P -c "from PIL import Image;from collections import Counter;import sys
im=Image.open(sys.argv[1]).convert('RGBA')
print(Counter('#%02x%02x%02x'%p[:3] for p in im.getdata() if p[3]>250).most_common(6))" <logo-color>.png
```

**No usar `derive_palette` de la GUI con un color oscuro**: el fondo sale azul medio e ilegible. Armar el `theme` a mano. Plantilla usada en FANALCA (azul oscuro `#081c49` + azul `#009edd`):

```json
"theme": {
  "accent": "<oscuro>", "accent_hover": "<oscuro un poco más claro>",
  "banner_gradient": "linear-gradient(135deg, <oscuro> 0%, <intermedio> 55%, <más claro> 100%)",
  "banner_text": "#ffffff", "banner_shadow": "0 4px 14px rgba(<oscuro en rgb>,0.30)",
  "content_bg": "<tinte muy claro del color de marca>", "card_bg": "#ffffff",
  "text": "#1f2328", "text_muted": "#57606a", "border": "<tinte claro>"
}
```

### 6.3 `site_config.json` y generar

Títulos, `site_url`, `logos`, `supabase` (url + anon key) — ver el esquema en `CLAUDE.md`. **Conectar el remote antes de generar** (los QR salen de él):

```bash
git remote add origin https://github.com/<cuenta>/<repo>.git
python3 excel_migrator.py plantilla_sitio.xlsx docs/
head -3 docs/urls.txt
python3 -m pytest -q tests/ --ignore=tests/supabase && node --test tests/js/*.test.js
```

### 6.4 Revisar en celular y escritorio (sin servidor)

```bash
B=$(find ~/.cache/ms-playwright -name chrome-headless-shell -type f | head -1)
$B --no-sandbox --hide-scrollbars --window-size=390,800  --screenshot=/tmp/<scratch>/home_390.png  file://$PWD/docs/index.html
$B --no-sandbox --hide-scrollbars --window-size=1280,800 --screenshot=/tmp/<scratch>/home_1280.png file://$PWD/docs/index.html
```

Los emojis salen como cuadros vacíos en el headless (no tiene la fuente); en celulares reales se ven.

---

## Parte 7 — Publicar ✅ validado

1. `gh auth status` → DEXCO activa; `git config user.email` → Gmail de DEXCO.
2. `gh repo create <cuenta>/<repo> --public --description "QR fichas técnicas y mantenimientos — <planta>"`.
3. `docs/superpowers/` ya viene en `.gitignore` (no se publica).
4. **`git status` completo** — revisar que no entre nada inesperado (documentos del cliente, `.env`, `.env.test`, claves).
5. Commit + (con confirmación) `git push -u origin master`.
6. Pages: `gh api -X POST repos/<cuenta>/<repo>/pages -f "source[branch]=master" -f "source[path]=/docs"`.
7. Comprobar con la Parte 10.

---

## Parte 8 — Supabase ⏳ en curso en FANALCA

### 8.1 Migraciones (las corre el usuario: piden la contraseña de la base)

```bash
chmod +x setup_supabase_planta.sh
./setup_supabase_planta.sh <ref>
```

Pide, en orden: el ref otra vez (confirmación), la **contraseña de la base** (`supabase link`) y `Y` para las 12 migraciones (`db push`).

**En FANALCA el `link` funcionó pero el `db push` no aplicó nada.** Una vez linkeado, Claude puede terminarlo **sin contraseña** (la CLI usa un rol de login temporal):

```bash
supabase migration list --linked          # columna "remote" vacía = no se aplicó
supabase db push --linked --dry-run       # muestra las 12
supabase db push --linked --yes
```

El aviso final *"failed to cache migrations catalog … pgdelta-target-ca.crt"* es de una caché local: **no afecta**. Verificar siempre con la consulta.

**Comprobar** (Claude):

```bash
supabase db query --linked "select
  (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name in ('profiles','maintenance_records','maintenance_attachments','maintenance_comments','maintenance_audit_log','equipment_classes','maintenance_activities','equipment_tags','maintenance_record_activities','maintenance_manual_schedule')) as tablas,
  (select count(*) from information_schema.views where table_schema='public' and table_name in ('author_names','maintenance_schedule','maintenance_agenda')) as vistas,
  (select count(*) from storage.buckets where id='maintenance-attachments') as bucket,
  (select count(*) from auth.users) as usuarios,
  (select count(*) from public.profiles) as perfiles"
```

Esperado: `tablas 10`, `vistas 3`, `bucket 1`. ✅ Validado en FANALCA (2026-11-17).

### 8.2 Resto ⏳

Cerrar auto-registro, crear usuarios + `profiles`, backups: Parte 3.3–3.5 de [INSTRUCTIVO_NUEVO_PROYECTO.md](INSTRUCTIVO_NUEVO_PROYECTO.md). Se documentará aquí cuando se haga en FANALCA.

---

## Parte 9 — Rutinas y módulo administrativo web ⏳ en diseño (FANALCA)

### 9.1 Documentos de mantenimiento del cliente

Pedirlos junto con las fichas. En FANALCA (carpeta del proyecto `INGENIERIA\5. M mant`, copiados a `Assets/Mantenimiento/`):

| Documento | Qué trae | Cómo leerlo |
|---|---|---|
| `…-MP-02-….xls` — Programa de mantenimiento preventivo | Por **tipo de equipo** (bombas sumergibles, sopladores, bombas neumáticas, difusores, tanques, filtro prensa, tablero, tubería…): lista de operaciones con frecuencia `D/S/Q/M/BM/TM/SM/A` (diario … anual; `NA` = por horas según fabricante) | `xlrd` (es `.xls` viejo) |
| `…-MP-03-….docx` — Listado de repuestos | Por tipo de equipo: TAGs, marca/modelo, función y repuestos críticos/importantes/opcionales con cantidades | `unzip -p <docx> word/document.xml` y quitar etiquetas |

El MP-02 trae **más de 4 operaciones por tipo de equipo** (bombas sumergibles: 9; sopladores: 15). Ver 9.3 sobre cómo se agrupan.

### 9.2 Qué hacía la GUI de escritorio (para no perder nada al pasarla a la web)

No hay `.exe`: `windows_launchers/*.bat` arrancan `gui.py` en WSL y abren `localhost:8080` (con acceso directo en el escritorio).

- **Principal:** carpeta destino, logo + enlace, título, color, subir Excel de fichas y `TAG_RESOURCES.xlsx`, "Forzar regeneración", **Generar sitio**, **Ver sitio** (publicar era `git push` aparte).
- **🧰 Mantenimientos** (login): historial por TAG, registrar (horas HMI, actividades, fotos, audio), comentarios; oficina edita/borra.
- **📋 Plan de mantenimiento** (login, oficina): sábana (clases y actividades), equipos (clase + régimen A/B, auto-asignar), agenda (vencidos, programar, reprogramar con motivo, programar en lote).
- **No tenía** gestión de usuarios (se creaban a mano en Supabase).

### 9.3 Decidido en FANALCA (2026-11-17)

- **Roles:** `tecnico` registra eventos de mantenimiento; `oficina` hace lo administrativo y las utilidades futuras. Personas de la planta y de RPCI entran con **usuarios distintos** de cualquiera de los dos roles (no hay un rol aparte para RPCI).
- **Administración online:** lo de `gui.py` pasa al sitio web con login de Supabase, **incluida la gestión completa de usuarios** (crear con el rol elegido, etc.). GitHub Pages no ejecuta Python, así que se reescribe como páginas del sitio que hablan con Supabase; crear usuarios va por una Edge Function (la `service_role` nunca llega al navegador).
- **Rutinas por tipo de equipo:** para cada **tipo de equipo** (bomba sumergible, soplador, bomba neumática, filtro prensa, tanque…) se eligen las **4 o 5 rutinas más importantes** del programa del cliente (MP-02), preferiblemente de **frecuencia mensual o mayor** (M, BM, TM, SM, A o por horas). Lo diario y semanal queda fuera del sistema. Máximo 5 por tipo.
- **Registro siempre desde el celular**, y los registros deben ser **fáciles de encontrar por TAG**.
- **TAGs que comparten ficha (pares A/B) son equipos distintos para mantenimiento:** cada uno tiene sus propios registros y, más adelante, su propio calendario (la titular y la de respaldo no se mantienen igual). La ficha puede ser la misma; el historial no.
- Tipos de equipo **sin rutinas en el MP-02** (en FANALCA: compresor de pistón `100-C-01` y mezclador axial `400-MX-01`): pedirlas al cliente o tomarlas del manual del fabricante; no inventarlas.
- **Calendario/programación:** fuera por ahora; se propondrá después.

### 9.4 Cargar las rutinas ✅ validado en FANALCA

Las rutinas viven en un SQL por planta: [supabase/datos/fanalca_rutinas.sql](supabase/datos/fanalca_rutinas.sql) (8 tipos de equipo, 38 rutinas, 15 TAGs). Para DEXCO:

1. Copiar a `supabase/datos/dexco_rutinas.sql`.
2. Reutilizar los tipos que se repitan (bombas sumergibles, sopladores, neumáticas, tanques… ya tienen sus 5 rutinas) y armar los nuevos desde el programa preventivo de DEXCO (máx. 5, mensual o mayor).
3. Cambiar la lista TAG → tipo al final del archivo (pares A/B con el mismo `group_key`).
4. Aplicar y verificar:

```bash
supabase db query --linked -f supabase/datos/dexco_rutinas.sql
supabase db query --linked "select c.name, count(a.*) rutinas from public.equipment_classes c left join public.maintenance_activities a on a.class_id=c.id group by c.name"
```

`supabase db query -f` **sí** aplicó este archivo completo (varias sentencias dentro de `begin … commit`) con la CLI 2.109.1.

**Equipos sin rutinas en el programa del cliente: no dejarlos vacíos.** Armarlas con práctica estándar del fabricante y decírselo al usuario. En FANALCA: compresor de pistón (filtro de aspiración, correas, aceite, válvula de seguridad + presostato, válvulas del cabezal) y difusor ciclónico chino (burbujeo, presión/caudal, fugas de aire, **sacar la parrilla y limpiarla**, anclajes y estado de difusores). Para difusores ciclónicos no hay manuales públicos útiles: la limpieza de la parrilla y la revisión de incrustaciones son la clave.

Cuando el módulo exista, vendrá en el código clonado y aquí se documentará cómo activarlo para DEXCO.

### 9.6 Administración web — qué hay en producción ✅ (FANALCA, 2026-11-18)

URL `…/admin/`. Lo que reemplaza del escritorio:

| Escritorio (`gui.py`) | Web (`/admin/`) |
|---|---|
| 🧰 Mantenimientos: ver, editar (fecha, tipo, descripción, repuestos, horas, rutinas), borrar | 📋 Registros (filtro por TAG, por mes, cursor) |
| 📋 Plan → Sábana: tipos, rutinas, semanas/horas, horas/día, activar | 🔧 Rutinas (tope 5 activas en pantalla; en la base, fase 2) |
| 📋 Plan → Equipos: tipo y régimen del par A/B | ⚙️ Equipos |
| Exportar sábana | ☰ Más → Descargar (rutinas, equipos, registros 12 meses) en CSV para Excel |
| — (se hacía en el panel de Supabase) | 👥 Usuarios + 🔑 Mi cuenta |

**🌐 Sitio desde el celular** (☰ Más → Sitio): títulos, color, enlace y archivo del logo, Excel de fichas; y en ⚙️ Equipos, los enlaces de Especificaciones / Manual / Mantenimiento por TAG. Se guarda en Supabase (`site_settings`, `tag_resources`, bucket público `site-sources`) y el Action **`site-sync.yml`** (cada 15 min) regenera `docs/` con `site_sync.py` y hace push. La pantalla muestra "⏳ En cola" o "✅ Publicado" comparando `site_settings.version` con `docs/migration_metadata.json`.

Para DEXCO, después de `supabase db push`, **sembrar la fila** (si no, la pantalla dice "Falta la configuración inicial"), con `accent` vacío para no pisar el tema armado a mano:

```sql
insert into public.site_settings (id, site_title, banner_title_full, banner_title_short, logo_href)
values (1, '<site_title>', '<banner_title_full>', '<banner_title_short>', '<web del cliente>')
on conflict (id) do nothing;
```

y generar el sitio una vez con `SITE_SOURCE_VERSION=<version de esa fila en formato REST>` para que el Action no regenere de entrada (ver cómo en la sesión de FANALCA: `curl …/rest/v1/site_settings?select=version`). Verificar con `gh workflow run site-sync.yml` → "Sin cambios".

**Fuera a propósito:** agenda y programación manual (el calendario se define después). `gui.py` queda solo como respaldo.

**Acceso (requisito del usuario):** el sitio público de las fichas lleva un **ícono ⚙️ en el banner** (a la derecha de la 🔍) que abre `/admin/`, además del ítem "⚙️ Administración" en el menú ☰. Verificado sin desborde a 360 px.

**Lo que la web hace y la GUI no hacía (validado en FANALCA 2026-11-18):**

| Función | Dónde |
|---|---|
| Resultado de cada publicación: ✅ / ⏳ / ❌ con TAG publicados, avisos (hojas ignoradas, logos descartados) y el registro completo | 🌐 Sitio, arriba (`docs/publish_status.json`, lo escribe `site_sync.py`) |
| **Vista previa del Excel** antes de subirlo: TAG nuevos, los que quedan sin ficha (avisa si tienen registros), sin categoría, hojas ignoradas | 🌐 Sitio → Excel de fichas |
| **Códigos QR** a tamaño real con línea de corte, en los formatos físicos de RPCI: **T-Card** 9,1 × 6,0 cm (para colgar; antes 8,6 × 5,5, el usuario pidió +0,5 cm por lado con todo escalado parejo para no deformar el QR), **Mega T-Card** 18,2 × 12 cm (el doble) (adhesivo para tanques y equipos grandes) y **Key-holder Tag** 5 × 3 cm (instrumentos pequeños). QR con corrección alta (H) y **logo del cliente al centro**; en T-Card y Mega, **logo de RPCI a la derecha del QR**, TAG y servicio. Mismo diseño que `~/createQRSuperRectangles` (TCard 5,5 × 8,6 cm). **Orificio para amarra plástica** arriba en todos los formatos (círculo + cruz de centro), mismo tamaño físico: 4,5 mm en T-Card y Mega, 3,5 mm en Key-holder; **centrado arriba** para que la tarjeta cuelgue derecha (pedido del usuario); el QR arranca debajo de una franja libre (QR de 5,1 cm en la T-Card). **Selección:** casilla por etiqueta y casilla general (marca/desmarca todo lo del filtro, queda a medias si hay mezcla); solo se imprimen las marcadas — p. ej. reimprimir un único TAG de EQUIPOS | ☰ Más → 📱 Códigos QR |
| **🪄 Auto-asignar** el tipo de equipo a los TAG sin tipo (letra del TAG + palabras clave de `sabana_base.xlsx`) | ⚙️ Equipos |
| **📷 Fotos del equipo** desde la cámara del celular (se comprimen a 1600 px; salen primero en la ficha) | ⚙️ Equipos → tocar el TAG |
| Enlaces de documentos **en bloque** (subir `TAG_RESOURCES.xlsx`; los editados uno a uno ganan) | 🌐 Sitio |
| **📥 Importar rutinas base** de la biblioteca (no pisa lo existente, respeta el tope de 5) | 🔧 Rutinas |

**⚠️ Documentos de cada ficha (se escapó en FANALCA, no repetir).** Cada ficha debe tener sus botones "Ficha técnica (PDF)", "Manual" y "Mantenimiento". **No salen solos**: hay que cargar los enlaces. Pasos en DEXCO, apenas se genere el sitio:

1. **Ficha técnica (PDF):** los PDF que vienen junto al Excel (en FANALCA `FANPH2-…-PD-03xx.pdf`). Leer el TAG de cada PDF (`pypdf`, primera página), copiarlos a `docs/assets/fichas/<TAG>.pdf` (los pares A/B comparten PDF) y cargar `tag_resources.specifications` con la URL pública.
2. **Manual del fabricante:** buscar el oficial por marca y modelo (columna MARCA / MODELO de la ficha). **Solo enlaces verificados** (`curl` → `200 application/pdf`) y de la versión correcta (material, serie). En FANALCA solo se encontraron los de Wilden P1 y P.025 plásticas (Axflow); el resto lo sube el usuario desde ⚙️ Equipos → **📎 Subir PDF**.
3. Al cargar enlaces en la base, el Action `site-sync` regenera solo. Después: `git pull` antes de generar en local, porque el bot sube `TAG_RESOURCES.xlsx` y `docs/`.

Validado de punta a punta en FANALCA (2026-11-18): cambio en la base → Action → push del bot → Pages → botones en la ficha publicada.

**Logo para QR:** el del banner suele ser blanco y no se ve sobre el QR. Va aparte, a color sobre fondo blanco, en `docs/assets/logos/LogoQR.png` (🌐 Sitio → "Logo para los QR"; migración `20261118160000_qr_logo.sql`). En FANALCA es `LogoCliente_azul.png`. Si falta, usa `LogoCliente.png`.

**`sabana_base.xlsx` ahora trae los 8 tipos de equipo de FANALCA** (bombas sumergibles, neumáticas, sopladores, compresor, filtro prensa, reactor MBBR, tanques, difusor ciclónico) con sus 38 rutinas, letras de TAG y palabras clave, más la centrífuga horizontal de ejemplo. **En DEXCO:** después de subir el Excel de fichas, 🔧 Rutinas → 📥 Importar rutinas base y ⚙️ Equipos → 🪄 Auto-asignar; revisar lo que no coincida. Migraciones de esta parte: `20261118140000_site_settings.sql`, `20261118150000_site_photos_resources.sql`.

**Para DEXCO:** todo viene en el código. Pasos: `supabase db push --linked` + `supabase functions deploy admin-users --project-ref <ref> --use-api` + regenerar el sitio + push. Prueba desde el celular: entrar como oficina, crear un técnico, entrar con él (ve solo Resumen, Mis registros, Mi cuenta), desactivarlo.

### 9.5 Administración web por perfiles — plan (FANALCA, 2026-11-18)

- **El usuario administra solo desde el celular.** Nada administrativo puede depender de `gui.py`; la GUI de escritorio queda solo para generar el sitio desde el Excel.
- **URL dedicada:** `https://<cuenta>.github.io/<repo>/admin/` (ítem "⚙️ Administración" al final del menú ☰). Login con usuario y contraseña de Supabase.
- **Pantallas según perfil** (barra inferior, máx. 5):
  - `oficina`: 🏠 Resumen · 📋 Registros · 🔧 Rutinas · ⚙️ Equipos · ☰ Más (👥 Usuarios, 🔑 Mi cuenta).
  - `tecnico`: 🏠 Resumen · 📋 Mis registros · 🔑 Mi cuenta.
- **Pensado para 1 millón de registros:** "última vez" por TAG × rutina en tabla (`maintenance_last_done`), índices por TAG + fecha, paginación por cursor, búsqueda con filtros (TAG, rutina, fechas, texto, autor, con fotos) en vista emergente con chips.
- **Próximo mantenimiento por rutina** en la ficha (una línea + vista emergente), franja de vencidos en el inicio y punto de color por TAG.
- Diseño: [specs/2026-11-17-administracion-web-design.md](specs/2026-11-17-administracion-web-design.md). Planes: [plans/2026-11-18-administracion-web.md](plans/2026-11-18-administracion-web.md) (maestro), [plans/2026-11-17-fase1-usuarios.md](plans/2026-11-17-fase1-usuarios.md), [plans/2026-11-18-proximos-y-busqueda.md](plans/2026-11-18-proximos-y-busqueda.md).
- **Para DEXCO, cuando esté terminado:** `supabase db push --linked` (migraciones nuevas) + `supabase functions deploy admin-users --project-ref <ref> --use-api` + regenerar el sitio. La prueba de aceptación se hace **desde el celular** (Task A8 del plan maestro). Esta sección se completa con lo aprendido al terminar FANALCA.

---

## Parte 10 — Cada vez que se actualiza el sitio

Pages publica solo con cada push (Action **"pages build and deployment"**, ~30 s). No activar `.github/workflows/main.yml.disabled` (resto incompleto de D'Vida). Después del push, **un** comando en segundo plano:

```bash
gh run watch -R <cuenta>/<repo> $(gh run list -R <cuenta>/<repo> -L1 --json databaseId -q '.[0].databaseId') --exit-status >/dev/null 2>&1 \
  && echo "✅ Pages publicado" || echo "❌ Pages falló"
```

Reportar solo esa línea. Si falla: `gh run view <id> --log-failed`.

### Supabase despierto (Action `supabase-keepalive.yml`) ✅ validado en FANALCA

El plan gratis de Supabase **pausa el proyecto tras 7 días sin actividad**. `.github/workflows/supabase-keepalive.yml` (viene en el código clonado) hace una consulta real a la base **cada 2 días** leyendo URL y anon key de `site_config.json`: en DEXCO no hay que configurar nada, solo que `site_config.json` tenga el Supabase de DEXCO. Verificar después del primer push:

```bash
gh workflow run supabase-keepalive.yml -R <cuenta>/<repo>
gh run watch -R <cuenta>/<repo> $(gh run list -R <cuenta>/<repo> -w supabase-keepalive.yml -L1 --json databaseId -q '.[0].databaseId') --exit-status
```

GitHub **desactiva los Actions programados si el repo pasa 60 días sin commits**. Lo cubre `.github/workflows/repo-keepalive.yml` (también viene en el código): el día 1 de cada mes, si el último commit tiene 30 días o más, hace un commit mínimo en `.github/keepalive.txt`; si hubo cambios, no hace nada. Requiere que la cuenta de `gh` tenga el scope `workflow` (la de FANALCA lo tenía) para poder subir los `.yml`. Si aun así Supabase se pausó: panel de Supabase → *Restore project*.

---

## Parte 11 — QR y cierre

- Generar los QR desde `docs/urls.txt` **solo con el sitio completo** (Supabase y usuarios funcionando).
- Adaptar `CLAUDE.md` a DEXCO (remote, URL, Supabase ref, Excel de origen, estado de archivos).
- Guardar en la memoria de Claude las cuentas de DEXCO.

---

## Seguridad

- En FANALCA la contraseña de Supabase estaba en `QR/Datos.txt` dentro de la carpeta compartida. **No repetirlo:** gestor de contraseñas.
- La `anon` key sí es pública (va en el sitio); la protege RLS.

## Problemas encontrados en FANALCA

| Síntoma | Causa | Solución |
|---|---|---|
| Un par A/B sale como un solo TAG | Hoja con `A-B` (guion) | Ya soportado |
| "Forzar regeneración" toma la sábana como fichas | Detección solo `*.xlsx`, sin excluir `sabana_base.xlsx` | Arreglado (`list_fichas_candidates`) |
| `pytest` no existe | Falta `requirements-dev.txt` | Parte 1 |
| `test_feed_page_embeds_tag_index`: `15 == 42` | Número fijo de D'Vida | Arreglado (lee `migration_metadata.json`) |
| Supabase MCP: "You do not have permission" | Conector en otra cuenta | CLI, o `.mcp.json` del proyecto (Parte 1) |
| `rm` bloqueado: "Dangerous rm operation" | Glob relativo después de `cd` | Rutas absolutas |
| `python3 -I` no encuentra `PIL` | `-I` ignora `~/.local` | Usar `python3 -P` (y correr fuera de carpetas con archivos descargados) |
| Fondo del sitio ilegible con color oscuro | `derive_palette` aclara +0.45 desde un color muy oscuro | Tema a mano (Parte 6.2) |
| Commits firmados con el correo personal | `user.email` global | `git config user.email` local (Parte 3.1) |
| Documentos del cliente subidos sin querer | `git add -A` sin revisar | Mirar `git status` completo antes de cada commit |
| Las fichas pierden los botones de documentos tras regenerar en local | El Action no guardaba `TAG_RESOURCES.xlsx` (un `git add` con varios archivos fallaba si faltaba uno) | Arreglado en `site-sync.yml` (agrega archivo por archivo). Antes de regenerar en local: `git pull`; si falta `TAG_RESOURCES.xlsx`, rearmarlo desde la base con `site_sync.write_resources_xlsx(site_sync.merge_resources({}, filas_de_tag_resources), …)` |
