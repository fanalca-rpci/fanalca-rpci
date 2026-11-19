# Próximo mantenimiento por rutina + historial a escala — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada TAG muestra, en una línea y una vista emergente, la fecha tentativa del próximo mantenimiento de cada rutina; y el historial se busca y filtra (TAG, rutina, fechas, texto, autor, con fotos) rápido aunque haya 1 millón de registros.

**Architecture:** La base guarda la última vez por TAG × rutina en `maintenance_last_done` (triggers), indexa los registros para recorrerlos por cursor y expone `search_maintenance_records(...)`. En el navegador, `maintenance_status.js` (puro) clasifica cada rutina y `maintenance_search.js` (puro) arma filtros/URL/cursor; `maintenance.js` y `maintenance_feed.js` los usan para pintar.

**Tech Stack:** Postgres (triggers, `pg_trgm`, función SQL `security invoker`) · `supabase-js@2` UMD · JS vainilla · pytest contra `supabase start` · `node --test` · Chromium headless.

**Spec:** [specs/2026-11-17-administracion-web-design.md](../specs/2026-11-17-administracion-web-design.md) — secciones "Próximo mantenimiento por rutina" e "Historial a escala".

## Global Constraints

- Español en todo. Celular primero: verificar **360 y 390 px** antes que escritorio; toques ≥ 44 px; la línea de estado de la ficha **no pasa de un renglón a 360 px**; información secundaria plegada (chevron) o en vista emergente.
- Ventana "próxima": **7 días** si `interval_weeks ≤ 4`, **14** si mayor. "Crítica": atraso **> mitad de la frecuencia** (`days_overdue * 2 > interval_weeks * 7`). "Nunca realizada" no es vencida.
- Orden de urgencia: `critica` → `vencida` → `nunca` → `proxima` → `al_dia`.
- Nunca paginar con offset; nunca pedir `count: 'exact'`. Página = **20**.
- Pares A/B: todo por TAG; nada se agrega por `group_key`.
- Lectura del historial y de las fechas: pública (anon), como hoy. Escritura: igual que hoy.

## Review Focus

1. **Registro editado de fecha o de TAG, o borrado** → la "última vez" de las rutinas afectadas se recalcula (incluido volver a "Nunca realizada" si era el único). *(Task 1)*
2. **Dos registros de la misma rutina el mismo día** → el cursor no repite ni salta ninguno al "Cargar más" (desempate por `created_at`, luego `id`). *(Task 2)*
3. **Texto de búsqueda con `%`, `_`, comillas o tildes** ("fugá 50%") → se busca literal, sin error ni comodines inesperados. *(Task 2)*
4. **Fecha "Personalizado" con desde > hasta, o vacía** → se corrige o se ignora con aviso, nunca una lista vacía sin explicación. *(Task 3)*
5. **Rutina filtrada que no pertenece al TAG filtrado** (URL vieja o compartida) → se descarta ese filtro y se avisa con un chip "Rutina no aplica a este equipo". *(Task 3)*

---

### Task 1: `maintenance_last_done` + índices

**Files:**
- Create: `supabase/migrations/20261118120000_scale_last_done.sql`
- Test: `tests/supabase/test_last_done.py`

**Interfaces:**
- Produces: tabla `public.maintenance_last_done(tag_id text, activity_id uuid references maintenance_activities on delete cascade, performed_at date not null, record_id uuid not null, primary key (tag_id, activity_id))`, RLS `select` para `anon, authenticated`, sin escritura de clientes. Función `public.refresh_last_done(p_tag text, p_activity uuid)` (`security definer`, `set search_path = public`) que recalcula una pareja (borra la fila si no queda ningún registro). Triggers: `after insert or delete` en `maintenance_record_activities`; `after update of performed_at, tag_id or delete` en `maintenance_records` (recalcula viejo y nuevo TAG para todas sus rutinas). Backfill al final de la migración. `maintenance_schedule_at` pasa a leer `last_done` desde esta tabla (mismas columnas de salida).
- Índices: `maintenance_records (tag_id, performed_at desc, created_at desc, id desc)`, `maintenance_records (performed_at desc, created_at desc, id desc)`, `maintenance_record_activities (activity_id, record_id)`, `create extension if not exists pg_trgm` + GIN `gin_trgm_ops` sobre `maintenance_records.description`.

- [ ] **Step 1: Tests que fallan** (`random_tag_id` + rutinas de una clase de prueba creada en el test con `service_client`):
  - `test_registro_con_rutina_crea_last_done`
  - `test_registro_mas_viejo_no_pisa_el_mas_nuevo`
  - `test_borrar_unico_registro_vuelve_a_nunca` (fila desaparece; `maintenance_schedule.status = 'sin_registro'`)
  - `test_cambiar_fecha_recalcula`
  - `test_cambiar_tag_recalcula_ambos`
  - `test_quitar_rutina_del_registro_recalcula`
  - `test_schedule_usa_la_tabla` (`due_date = performed_at + 7*interval_weeks`)
- [ ] **Step 2:** `python3 -m pytest tests/supabase/test_last_done.py -v` → FAIL.
- [ ] **Step 3:** Escribir la migración.
- [ ] **Step 4:** Aplicar en local (`psql … -f`) y `python3 -m pytest tests/supabase -q` → todo PASS (incluye `test_maintenance_plan.py`, `test_overdue.py`).
- [ ] **Step 5: Prueba de carga local:** script `tests/supabase/seed_volumen.sql` (no corre en CI) que inserta **1.000.000** registros en 15 TAGs con rutinas; medir con `explain analyze`: `maintenance_schedule` para un TAG **< 50 ms**; primera página por TAG **< 50 ms**. Anotar los tiempos en el commit.
- [ ] **Step 6: Commit** `feat: última vez por TAG y rutina en tabla + índices para escala`.

---

### Task 2: `search_maintenance_records` (cursor + filtros)

**Files:**
- Modify: `supabase/migrations/20261118120000_scale_last_done.sql` (misma migración) o Create: `supabase/migrations/20261118120100_search_records.sql`
- Test: `tests/supabase/test_search_records.py`

**Interfaces:**
- Produces: `public.search_maintenance_records(p_tags text[] default null, p_activity uuid default null, p_from date default null, p_to date default null, p_text text default null, p_author uuid default null, p_with_media boolean default false, p_after jsonb default null, p_limit int default 20) returns setof jsonb` (`language sql stable security invoker`), `grant execute` a `anon, authenticated`. Cada fila: `{id, tag_id, performed_at, created_at, description, hmi_hours, author_name, activities: [{id, name}], media_count}`. Orden `performed_at desc, created_at desc, id desc`. `p_after = {"performed_at","created_at","id"}` del último visto (comparación de tupla). `p_limit` acotado a 1..50. `p_text`: `ilike '%' || escape(p_text) || '%'` con `%`, `_` y `\` escapados (usa el índice trigram).

- [ ] **Step 1: Tests que fallan:**
  - `test_filtra_por_tag_y_rutina`
  - `test_rango_de_fechas_inclusivo`
  - `test_texto_literal_con_comodines` (descripción "fuga 50%_x" se encuentra con `"50%_"`, y `"%"` solo no trae todo)
  - `test_con_fotos`
  - `test_autor`
  - `test_cursor_sin_repetir_ni_saltar` (25 registros, 5 el mismo día con mismo `performed_at`; páginas de 10 → 25 ids únicos en orden)
  - `test_limite_acotado` (`p_limit=1000` → 50)
  - `test_anonimo_puede_buscar`
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `python3 -m pytest tests/supabase -q` → PASS; `explain analyze` con el volumen de Task 1: filtro TAG + rutina + 12 meses **< 100 ms**.
- [ ] **Step 5: Commit** `feat: búsqueda de mantenimientos por cursor con filtros`.

---

### Task 3: Lógica pura — estados y búsqueda

**Files:**
- Create: `maintenance_status.js`, `maintenance_search.js`
- Test: `tests/js/maintenance_status.test.js`, `tests/js/maintenance_search.test.js`

**Interfaces:**
- `window.MaintStatus` / `module.exports`:
  - `classify(row, today: 'YYYY-MM-DD') -> {state: 'critica'|'vencida'|'nunca'|'proxima'|'al_dia', days: number|null, label: string}` con `row = {due_date, last_done_at, interval_weeks}`. Labels exactos: `"Nunca realizada"`, `"Vence hoy"`, `"Vence en N días"`, `"Vencida hace N días"`, `"Próxima: 18 may 2027 · en 6 meses"` (relativo: días < 31, semanas < 9, meses después; singular/plural correctos).
  - `sortByUrgency(rows) -> rows`
  - `summarize(rows, today) -> {worst, text}` — `text` corto para la línea de la ficha: `"🔴 2 vencidas · Próx. 22 nov"`, `"🟠 3 sin registro · Próx. 15 dic"`, `"✅ Al día · Próx. 15 dic"`; máximo **34 caracteres**.
  - `dotClass(state) -> 'dot-critica'|…`
- `window.MaintSearch` / `module.exports`:
  - `parseParams(search: string) -> filters` y `toParams(filters) -> string` (round-trip; claves `tag`, `rutina`, `desde`, `hasta`, `q`, `autor`, `media`, `registro`).
  - `presetRange(name: '30d'|'3m'|'12m'|'todo', today) -> {from, to}`
  - `normalizeRange(from, to) -> {from, to, warning?}` (invierte si desde > hasta con `warning: "Invertí las fechas"`).
  - `activeChips(filters, catalog) -> [{key, label}]` (descarta rutina que no aplica al TAG con chip `"Rutina no aplica a este equipo"`).
  - `groupByMonth(records) -> [{label: 'Noviembre 2026', items}]`
  - `toRpcArgs(filters, after) -> object` (nombres `p_*` de Task 2).

- [ ] **Step 1: Tests que fallan** con fechas fijas (`today='2026-11-17'`): el ejemplo del diseño (parrilla 26 sem hecha hoy → `al_dia` "Próxima: 18 may 2027 · en 6 meses"; el 2027-05-04 `proxima` "Vence en 14 días"; el 2027-05-19 `vencida` "Vencida hace 1 día"; el 2027-08-18 `critica`); mensual: el 2026-12-08 `proxima`, el 2026-12-30 `critica`; `summarize` ≤ 34 caracteres; `parseParams(toParams(f))` igual a `f`; los casos de Review Focus 4 y 5.
- [ ] **Step 2:** `node --test tests/js/*.test.js` → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** → PASS (incluye los existentes).
- [ ] **Step 5: Commit** `feat: lógica de estados de rutinas y de filtros de búsqueda`.

---

### Task 4: Ficha — línea de estado, vista emergente y formulario

**Files:**
- Modify: `maintenance.js` (reemplaza pestañas Programados/Plan por la línea + vista emergente; formulario con estado por casilla y aviso "Sin rutinas marcadas, las fechas no avanzan"; "Última: 8 oct" abre el registro; `?registrar=<activity_id>` sigue funcionando), `maintenance.css`, `excel_migrator.py` (contenedor `<div id="maint-status-line">` bajo el h1 de la ficha; cargar `maintenance_status.js` y `maintenance_search.js` en todas las páginas)
- Test: `tests/test_generator_feed.py` (o nuevo `tests/test_generator_status.py`)

**Interfaces:** Consumes `MaintStatus.*`, vista `maintenance_schedule` (lee `maintenance_last_done`).

- [ ] **Step 1: Tests del generador que fallan:** la ficha `equipos/100-P-01A.html` tiene `id="maint-status-line"` antes de "Ver ficha técnica" y carga `maintenance_status.js` antes de `maintenance.js`.
- [ ] **Step 2:** correr → FAIL. **Step 3:** implementar. **Step 4:** pytest + node → PASS.
- [ ] **Step 5: Celular contra Supabase local** con datos de prueba (una rutina en cada estado): capturas a 360/390 de la ficha, la vista emergente con "Al día" plegado y abierto, y el formulario. Criterios: línea en un renglón, sin scroll horizontal, ✕ y "📝 Registrar" ≥ 44 px.
- [ ] **Step 6: Commit** `feat: próximo mantenimiento por rutina en la ficha`.

---

### Task 5: Historial con filtros (feed y pestaña Realizados)

**Files:**
- Modify: `maintenance_feed.js`, `maintenance_feed.css` (buscador + "Filtros (n)" + vista emergente de filtros + chips + grupos por mes + cursor + `?registro=`; quitar el selector Realizados|Programados, que lo reemplaza la franja/lista de vencidos), `maintenance.js` (Realizados usa la misma búsqueda con TAG fijo), `excel_migrator.py` (`render_maintenance_page`: contenedores nuevos; `window.__CATALOG__` no — el catálogo de rutinas se pide a la base)
- Test: `tests/test_generator_feed.py` (ajustar aserciones del selector y de pestañas)

**Interfaces:** Consumes `MaintSearch.*`, `search_maintenance_records`.

- [ ] **Step 1:** Ajustar/agregar tests del generador (`id="feed-filters-btn"`, `id="feed-chips"`; ya no hay `feed-mode-programados`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Celular contra Supabase local con 1.000.000 de registros** (seed de Task 1): capturas a 360/390 de la lista, la vista de filtros y los chips; "Cargar más" 3 veces sin repetir; abrir enlace compartido `?tag=…&rutina=…&desde=…` reproduce la misma lista; cada página llega en < 1 s en red local.
- [ ] **Step 6: Commit** `feat: historial con filtros por TAG, rutina, fechas, texto, autor y fotos`.

---

### Task 6: Inicio y listas — franja de vencidos y puntos de color

**Files:**
- Modify: `excel_migrator.py` (`render_home`: franja `id="home-overdue"` apunta a `mantenimientos.html?vista=vencidos`; listas de categoría y menú con `<span class="mstat-dot" data-tag="…">`), `script.js` embebido o `maintenance.js` (una sola consulta a `maintenance_schedule` para todos los TAGs del índice → pinta puntos y franja), `maintenance_feed.js` (`?vista=vencidos`: una tarjeta por TAG con chevron y sus rutinas, ordenadas por urgencia)
- Test: generador (`mstat-dot` por cada TAG en `equipos/index.html`; franja presente)

- [ ] **Step 1:** tests → FAIL. **Step 2–4:** implementar → PASS.
- [ ] **Step 5:** capturas a 360/390 del inicio, una categoría y la vista de vencidos.
- [ ] **Step 6: Commit** `feat: franja de vencidos y estado por equipo en las listas`.

---

### Task 7: Publicar en FANALCA

- [ ] **Step 1:** Con confirmación: `supabase db push --linked --dry-run` (solo las migraciones de este plan) y `--yes`.
- [ ] **Step 2:** Verificar en producción: `maintenance_last_done` con backfill (el registro de prueba de 400-C-01B no tiene rutinas → sigue "Nunca realizada").
- [ ] **Step 3:** Regenerar `docs/`, revisar `git status` completo, commit, push, chequeo de Pages en una línea.
- [ ] **Step 4:** Capturas del sitio publicado a 360/390.
- [ ] **Step 5: Con el usuario desde su celular:** registrar en 400-MX-01 "burbujeo" + "parrilla" y ver la línea "🟠 3 sin registro · Próx. …"; filtrar el historial por rutina y por fecha; compartir el enlace.
- [ ] **Step 6:** Actualizar `INSTRUCTIVO_DEXCO_MEJORAS_PTAR.md` y `CLAUDE.md` **cuando el usuario apruebe** el resultado.
