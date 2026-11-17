# Instructivo: proyecto QR "DEXCO Mejoras PTAR"

Pasos para montar el sitio de fichas técnicas con QR + mantenimientos (Supabase) para **DEXCO Mejoras PTAR**, partiendo del proyecto de **FANALCA** (`fanalca-rpci/fanalca-rpci`).

> **Documento vivo.** Se escribe mientras se monta FANALCA (noviembre 2026). Las partes marcadas **⏳ pendiente de validar en FANALCA** todavía no se han probado de punta a punta; mientras tanto, seguir la parte equivalente de [INSTRUCTIVO_NUEVO_PROYECTO.md](INSTRUCTIVO_NUEVO_PROYECTO.md).

**Cómo usarlo:** abrir Claude Code en la carpeta del proyecto nuevo y escribir:

> Lee INSTRUCTIVO_DEXCO_MEJORAS_PTAR.md y montemos el proyecto DEXCO Mejoras PTAR.

**Regla de oro:** un proyecto = un repo de GitHub + un proyecto de Supabase + una cuenta de Gmail. Nada se comparte con FANALCA ni con D'Vida. Los mantenimientos se guardan por TAG en texto: si dos plantas comparten base, un `100-P-01A` de una se mezcla con el de la otra.

---

## Para Claude (leer antes de hacer nada)

- `CLAUDE.md` describe el sistema (escrito para D'Vida). Úsalo como documentación técnica, no como datos de DEXCO.
- **Pregunta primero, actúa después.** Pide los datos de la Parte 0 con `AskUserQuestion`. Lo que falte queda pendiente y se sigue con lo que no dependa de eso.
- **Pide confirmación** antes de: `git push`, crear el repo, activar Pages, `supabase db push`, crear usuarios.
- **Nunca** pongas la `service_role` / `secret` key de Supabase en el repo ni en `site_config.json`. Solo la `anon` key.
- **Nunca** copies contraseñas del usuario a archivos del proyecto (ver "Seguridad" al final).
- Español en todo. Rama `master`. Celular primero: probar a 360 y 390 px.
- **Borrar con rutas absolutas.** La protección de Claude Code bloquea `rm -rf carpeta/*` después de un `cd` (no puede resolver el glob). Usa `rm -rf "/home/<usuario>/<proyecto>/docs/assets/images"` y luego `mkdir -p`.

---

## Parte 0 — Datos que hay que pedir

| # | Dato | Ejemplo FANALCA | DEXCO |
|---|------|-----------------|-------|
| 1 | Correo Gmail del proyecto | `fanalca.rpci@gmail.com` | _pendiente_ |
| 2 | Cuenta y repo de GitHub (**público**, para Pages gratis) | `fanalca-rpci/fanalca-rpci` | _pendiente_ |
| 3 | Supabase: project ref, Project URL, **anon key** (la JWT "legacy" `eyJ…`; la `sb_publishable_…` también existe pero el código está probado con la anon) | `bcpthbpbyyrlemvbrshp` | _pendiente_ |
| 4 | Ruta de la carpeta de fichas técnicas | `D:\Proyectos con Ingenieria SAS\Proyectos - General\NP00043 STARD Fanalca\INGENIERIA\2. Fichas téc` | _pendiente_ |
| 5 | Títulos: sitio, banner largo, banner corto | `QR PTAR FANALCA` / `Documentación Técnica — PTAR FANALCA` / `PTAR FANALCA` | `QR DEXCO Mejoras PTAR` / … (confirmar) |
| 6 | Logo del cliente (PNG), URL de su página, color del tema | — | _pendiente_ |
| 7 | Personas: nombre, correo, rol (`tecnico` / `oficina`) | — | _pendiente_ |
| 8 | ¿Se publica `docs/superpowers/` (specs del sistema)? | Recomendado: no | — |

**Comprobar la anon key** antes de usarla: el payload del JWT (segunda parte, base64) debe decir `"ref":"<project ref>"` y `"role":"anon"`. Si el `ref` no coincide con la URL, el login falla con "Invalid API key".

---

## Parte 1 — Traer el código

El código base es el de **FANALCA** (ya trae los arreglos de esta guía). Se clona en una carpeta temporal y se copia **sin `.git`** para que DEXCO arranque con historial limpio y sin el `origin` de FANALCA.

```bash
cd ~
git clone https://github.com/fanalca-rpci/fanalca-rpci.git qr-base-tmp
mkdir -p ~/DEXCO_QR
rsync -a --exclude='.git' ~/qr-base-tmp/ ~/DEXCO_QR/
cd ~/DEXCO_QR && git init -b master
rm -rf ~/qr-base-tmp
```

- Trabajar siempre en el disco de WSL (`~/…`), **nunca** en `/mnt/c` o `/mnt/d` (lento, permisos y CRLF en los `.sh`).
- Si `rsync` no está: `sudo apt install -y rsync`.

**Comprobar:** `ls` muestra `gui.py`, `excel_migrator.py`, `supabase/`, `sabana_base.xlsx`; `git remote -v` no muestra nada.

---

## Parte 2 — Preparar el laptop

```bash
pip3 install --break-system-packages -r requirements.txt -r requirements-dev.txt
python3 -c "import nicegui, openpyxl, supabase, PIL, pytest; print('ok')"
node --version        # 22.x, para los tests JS
```

`requirements-dev.txt` trae `pytest`; sin él no corren los tests.

---

## Parte 3 — Cuentas: GitHub y Supabase de DEXCO

### 3.1 GitHub con una segunda cuenta

En el laptop ya hay una cuenta (p. ej. `jagilren`, con SSH). Se agrega la de DEXCO **por HTTPS** para que git no use la llave SSH personal contra el repo de DEXCO:

```bash
gh auth login --hostname github.com --git-protocol https --web   # entrar con la cuenta de DEXCO
gh auth setup-git
cd ~/DEXCO_QR
git config user.name  "DEXCO RPCI"          # solo este repo
git config user.email "<gmail de DEXCO>"
```

- **Comprobar:** `gh auth status` → la cuenta de DEXCO con `Active account: true`.
- Cambiar entre cuentas: `gh auth switch -u <cuenta>`. La cuenta activa es la que usa `git push` en **todos** los repos por HTTPS: antes de hacer push en otro proyecto, verificar con `gh auth status`.

### 3.2 Supabase

```bash
supabase login         # con la cuenta de Supabase de DEXCO
supabase projects list # debe aparecer el ref de DEXCO
```

> El conector de Supabase de claude.ai puede estar en **otra** cuenta: si `get_project` responde *"You do not have permission"*, no es error del proyecto, es la cuenta. Usar el CLI.

---

## Parte 4 — Quitar todo lo de FANALCA

Rutas absolutas (ver "Para Claude"). Con `P=/home/<usuario>/DEXCO_QR`:

```bash
rm -f "$P/plantilla_sitio.xlsx" "$P/TAG_RESOURCES.xlsx" "$P/fichas_source.xlsx" \
      "$P"/NP00043*.xlsm "$P/docs/assets/logos/LogoCliente.png" "$P/docs/CNAME" \
      "$P/docs/urls.txt" "$P/docs/migration_metadata.json" "$P/docs/README.md" \
      "$P/docs/index.html" "$P/docs/mantenimientos.html" "$P"/docs/search-index.*
rm -rf "$P/docs/equipos" "$P/docs/instrumentos" "$P/docs/tanques" "$P/docs/assets/images"
mkdir -p "$P/docs/assets/images"
find "$P" -name "*:Zone.Identifier" -not -path "$P/.git/*" -delete   # basura de copiar desde Windows
```

**No borrar** `sabana_base.xlsx` (biblioteca de mantenimiento reutilizable) ni `docs/assets/logos/LogoRPCI.png`.

Reemplazar la URL y los nombres de FANALCA (cambiar `<cuenta>/<repo>`):

```bash
sed -i 's#https://fanalca-rpci.github.io/fanalca-rpci/#https://<cuenta>.github.io/<repo>/#g' \
  update_site_from_excel.sh comandos.txt gui.py excel_migrator.py
sed -i 's#fanalca-rpci/fanalca-rpci.git#<cuenta>/<repo>.git#g; s#cd fanalca-rpci#cd <repo>#g; s#Fanalca_QR_New#DEXCO_QR#g' \
  New_Laptop.txt comandos.txt windows_launchers/*.bat windows_launchers/README.txt
sed -i 's#PTAR FANALCA#DEXCO Mejoras PTAR#g; s#Ej. https://www.fanalca.com#Ej. https://<sitio-dexco>#; s#Ej. QR PTAR FANALCA#Ej. QR DEXCO Mejoras PTAR#' \
  gui.py excel_migrator.py
```

Revisar en `windows_launchers/Lanzar_QR_App_WSL.bat` que `WSL_USER` sea el usuario de Ubuntu (`whoami`).

**Comprobar** (solo deben quedar `CLAUDE.md`, los instructivos y `docs/superpowers/`):

```bash
grep -rniIl "fanalca\|bcpthbpbyyrlemvbrshp\|dvida\|qgxvukllzuaiyhzegaef\|groupe_seb" . \
  --exclude-dir=.git --exclude-dir=superpowers --exclude=CLAUDE.md --exclude="INSTRUCTIVO_*.md"
```

Quedan como inofensivos: un comentario en `setup_supabase_planta.sh`, el nombre de un test (`test_ejemplo_dvida_…`) y los filtros de encabezado en `convert_fichas_to_template.py` (`IGNORE_LABELS`).

---

## Parte 5 — `site_config.json`

Editar con Claude (no a mano en el JSON para no romper comillas):

```json
{
  "site_title": "QR DEXCO Mejoras PTAR",
  "banner_title_full": "Documentación Técnica — DEXCO Mejoras PTAR",
  "banner_title_short": "DEXCO PTAR",
  "site_url": "https://<cuenta>.github.io/<repo>/",
  "theme": { "...": "lo genera la GUI desde el color elegido" },
  "logos": {
    "left": "assets/logos/LogoRPCI.png", "left_alt": "RPCI", "left_href": "https://rpci.com.co",
    "right": "assets/logos/LogoCliente.png", "right_alt": "DEXCO", "right_href": "<sitio de DEXCO o vacío>"
  },
  "supabase": { "url": "https://<ref>.supabase.co", "anon_key": "<anon key de DEXCO>" }
}
```

El `theme` que trae el archivo es el de FANALCA: cambiarlo desde la GUI (color picker) o pedirle a Claude que lo derive del color de DEXCO.

---

## Parte 6 — Fichas técnicas

### 6.1 Buscar el Excel, no los PDF

En FANALCA las fichas se entregaron como **PDF**, pero en la misma carpeta estaba el Excel del que salen (`NP00043 Fichas Técnicas_Equipos STARD.xlsm`) y la macro `SHEET2PDF.bas` que genera los PDF. **El sistema lee el Excel**: no hace falta extraer nada de los PDF. Buscar primero un `.xlsm`/`.xlsx` en la carpeta de fichas.

Si DEXCO solo tiene PDF (sin Excel), parar y avisarle al usuario: hay que pedir el Excel o construir un lector de PDF (no existe todavía).

### 6.2 Revisar las hojas antes de convertir

Listar las hojas sin abrir Excel:

```bash
unzip -p "<fichas>.xlsm" xl/workbook.xml | grep -oP '<sheet [^>]*name="\K[^"]+'
```

- Solo se procesan hojas con nombre `^\d{3}-[A-Z]+-` (p. ej. `600-TK-01`).
- **Pares A/B:** se separan en dos TAGs (cada equipo con su QR e historial) cuando la hoja termina en `A_B`, `A/B` o `A-B` (este último se agregó en FANALCA: `100-P-01A-B`, `400-C-01 A-B`). Hojas tipo `400-MX-01_02_03` → 3 TAGs.
- **Categoría por tipo:** `TK|R|F|SD` → TANQUES, `P|MX|M|C|PS` → EQUIPOS, `AIT|FIT|SV|LT` → INSTRUMENTOS. Un tipo fuera de esa lista no cae en ninguna categoría: preguntar al usuario y agregarlo en `convert_fichas_to_template.py` antes de convertir.

### 6.3 Convertir

```bash
cp "/mnt/d/…/<fichas>.xlsm" ~/DEXCO_QR/
python3 convert_fichas_to_template.py "<fichas>.xlsm"
python3 generate_tag_resources_template.py
```

- Acepta `.xlsm` directamente. La GUI y el auto-recovery de imágenes también lo detectan (arreglo de FANALCA: antes solo veían `.xlsx` y podían tomar `sabana_base.xlsx` como si fueran las fichas).
- **Si se reconvierte después de cambiar cómo se separan los TAGs**, quedan carpetas de fotos viejas en `docs/assets/images/` (en FANALCA: `100-P-01A-B/`). Borrarlas: no se publican como fichas pero ocupan espacio y confunden.

**Comprobar:** el log da el número de TAGs esperado por categoría y "N TAGs con imágenes". En FANALCA: 13 hojas → 15 TAGs (9 equipos, 6 tanques), 52 logos de encabezado descartados.

---

## Parte 7 — Generar el sitio

**Conectar el remote antes de generar** (los QR de `urls.txt` salen del remote):

```bash
git remote add origin https://github.com/<cuenta>/<repo>.git
python3 excel_migrator.py plantilla_sitio.xlsx docs/
head -3 docs/urls.txt      # deben ser https://<cuenta>.github.io/<repo>/…
```

**Tests** (sin red):

```bash
python3 -m pytest -q tests/ --ignore=tests/supabase
node --test tests/js/*.test.js
```

`tests/test_generator_feed.py` ya no tiene fijo el número de TAGs de D'Vida (42): compara contra `migration_metadata.json`.

---

## Parte 8 — Supabase de DEXCO ⏳ pendiente de validar en FANALCA

Seguir la Parte 3 de [INSTRUCTIVO_NUEVO_PROYECTO.md](INSTRUCTIVO_NUEVO_PROYECTO.md): `./setup_supabase_planta.sh <ref>`, cerrar el auto-registro, crear usuarios + fila en `profiles`, revisar backups.

Mientras no se apliquen las migraciones, las fichas se ven bien pero la sección de historial muestra error.

---

## Parte 9 — Publicar ⏳ pendiente de validar en FANALCA

1. `gh auth status` → cuenta de DEXCO activa.
2. `gh repo create <cuenta>/<repo> --public` (si no existe; vacío, sin README).
3. Decidir si `docs/superpowers/` se publica. Recomendado: no.
4. `git status`: que no aparezcan `.env`, `.env.test` ni nada con la `service_role`. Commit inicial.
5. Con confirmación: `git push -u origin master`.
6. Pages: `gh api -X POST repos/<cuenta>/<repo>/pages -f "source[branch]=master" -f "source[path]=/docs"`.
7. `gh api repos/<cuenta>/<repo>/pages/builds/latest --jq .status` → `built`; abrir la URL y probar en celular.

---

## Parte 10 — Módulo administrativo web ⏳ en diseño (FANALCA)

FANALCA pidió que la configuración (parámetros, rutinas de mantenimiento, etc.) se haga desde un módulo administrativo **en el sitio web**, con login de Supabase, en vez de la GUI de escritorio (`gui.py`). Cuando esté construido en FANALCA, viene en el código clonado; aquí se documentará cómo activarlo para DEXCO.

---

## Parte 11 — QR y cierre

- Generar los QR desde `docs/urls.txt` **solo con el repo definitivo publicado**.
- Adaptar `CLAUDE.md` a DEXCO (remote, URL, Supabase ref, Excel de origen, estado de archivos).
- Guardar en la memoria de Claude qué cuentas de GitHub/Supabase son las de DEXCO.

---

## Seguridad

- En FANALCA la contraseña de Supabase estaba en un `Datos.txt` dentro de la carpeta compartida del proyecto. **No repetirlo:** las contraseñas van en un gestor de contraseñas. Claude no las copia a ningún archivo.
- La `anon` key sí es pública (va en el sitio); la protege RLS.

## Problemas encontrados en FANALCA

| Síntoma | Causa | Solución |
|---|---|---|
| Un par A/B sale como un solo TAG | Hoja con `A-B` (guion) | Ya soportado; si aparece otra variante, ampliar el patrón en `expand_tags_from_sheet_name` |
| "Forzar regeneración" toma la sábana como fichas | La detección solo miraba `*.xlsx` y no excluía `sabana_base.xlsx` | Arreglado (`list_fichas_candidates` en `excel_migrator.py`) |
| `pytest` no existe | Falta `requirements-dev.txt` | Parte 2 |
| `test_feed_page_embeds_tag_index` falla con `15 == 42` | Test con número fijo de D'Vida | Arreglado (lee `migration_metadata.json`) |
| Supabase MCP: "You do not have permission" | Conector en otra cuenta | Usar `supabase` CLI con la cuenta del proyecto |
| `rm` bloqueado por "Dangerous rm operation" | Glob relativo después de `cd` | Rutas absolutas |
