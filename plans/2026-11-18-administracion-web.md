# Administración web completa — Plan maestro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar del todo la administración de escritorio (`gui.py` → 🧰 Mantenimientos y 📋 Plan) por una administración web en **`https://fanalca-rpci.github.io/fanalca-rpci/admin/`**, con usuario y contraseña de Supabase y pantallas según el perfil (`tecnico` / `oficina`), pulida y pensada para celular.

**Architecture:** Mismo sitio estático. `excel_migrator.py` genera `docs/admin/index.html` (shell propio, sin el menú lateral de fichas). La app es JS vainilla en módulos pequeños (`admin/*.js`), con lógica pura testeada con node y pantallas que solo pintan. Datos: Supabase REST con RLS (que ya permite a `oficina` editar registros, rutinas, tipos y equipos); usuarios por la Edge Function `admin-users`; historial por `search_maintenance_records`; estados por `maintenance_last_done`.

**Tech Stack:** HTML/CSS/JS vainilla · `supabase-js@2` UMD · Supabase (RLS, Edge Functions Deno, Postgres) · pytest + httpx · `node --test` · Chromium headless (capturas 360/390/1280).

**Spec:** [specs/2026-11-17-administracion-web-design.md](../specs/2026-11-17-administracion-web-design.md)

**Planes que este maestro incluye (no se repiten aquí):**
- [2026-11-17-fase1-usuarios.md](2026-11-17-fase1-usuarios.md): Tasks 1–3 y 5 (base de usuarios, Edge Function, `admin_logic.js`, cambiar contraseña). Su Task 4 (página) **la reemplaza** la Task A1 de este plan; su Task 7 la reemplaza la Task A8.
- [2026-11-18-proximos-y-busqueda.md](2026-11-18-proximos-y-busqueda.md): Tasks 1–3 (tabla de última vez, búsqueda por cursor, lógica de estados/filtros) y 4–6 (sitio público).

## Orden de ejecución

1. Usuarios T1 → T2 → T3 (base, función, lógica)
2. Próximos T1 → T2 → T3 (escala, búsqueda, lógica)
3. **A1 → A2 → A3 → A4 → A5 → A6 → A7** (este plan)
4. Usuarios T5 (contraseña también en la ficha) · Próximos T4 → T6 (sitio público)
5. **A8** publicar y probar con el usuario → **A9** instructivo DEXCO (tras su aprobación)

Cada bloque termina publicado en FANALCA y probado desde el celular del usuario; no se espera al final para mostrar.

## Global Constraints

- **URL dedicada:** `…/admin/` (archivo `docs/admin/index.html`), `<meta name="robots" content="noindex">`. Acceso desde el sitio: ☰ menú → "⚙️ Administración" (último ítem).
- **Celular primero:** cada pantalla se verifica a **360 y 390 px** antes que a 1280. Toques ≥ 44 px, una columna, acción principal fija abajo, sin scroll horizontal, sin textos cortados; lo secundario plegado (chevron) o en vista emergente desde abajo. Escritorio: contenido centrado máx. 720 px.
- **Navegación inferior**, máximo 5 destinos:
  - `oficina`: 🏠 Resumen · 📋 Registros · 🔧 Rutinas · ⚙️ Equipos · ☰ Más (👥 Usuarios, 🔑 Mi cuenta, Cerrar sesión)
  - `tecnico`: 🏠 Resumen · 📋 Mis registros · 🔑 Mi cuenta
- **Pulido profesional (todas las pantallas):** colores y logo de la planta (`site_config.json` → mismas variables CSS del sitio); esqueletos de carga en vez de "Cargando…"; estados vacíos con una frase útil y la acción siguiente; mensajes de éxito como aviso breve abajo (toast 3 s); confirmaciones como vista emergente con el verbo exacto ("Desactivar a Juan"), nunca `alert/confirm` del navegador; errores con `adminErrorMessage`; banda "Sin conexión" cuando `navigator.onLine` es falso; foco visible y `aria-label` en botones de solo ícono; fechas en español (`17 nov 2026`).
- Español en todo. `service_role` nunca en el navegador. RLS decide. Pares A/B siempre por TAG.
- Después de cada push: un solo chequeo de Pages en segundo plano, una línea.

## Review Focus

1. **Técnico que escribe la URL de una pantalla de oficina** (`/admin/#rutinas`) → ve "Esta sección es para perfil oficina" y su navegación de técnico; ninguna llamada de escritura se intenta. *(A1)*
2. **Dos oficinas editan la misma rutina a la vez** → gana el último guardado y la pantalla del otro se refresca al volver a la pestaña (`visibilitychange`), sin mostrar datos viejos como actuales. *(A3)*
3. **Bajar la frecuencia o desactivar una rutina con historial** → el historial no se toca; las fechas tentativas se recalculan; desactivar pide confirmación diciendo cuántos registros la usan. *(A3)*
4. **Cambiar el tipo de equipo de un TAG con registros** → aviso "Las rutinas de los registros anteriores se conservan; las fechas se calculan con las rutinas del tipo nuevo". *(A4)*
5. **Editar un registro y quitarle la única rutina** → la fecha tentativa de esa rutina vuelve a la anterior o a "Nunca realizada" (lo resuelve `maintenance_last_done`). *(A5)*

---

### Task A1: Shell de `/admin/` — login, perfil y navegación

**Files:**
- Create: `admin/app.js` (arranque, sesión, router por hash `#resumen|#registros|#rutinas|#equipos|#usuarios|#cuenta`), `admin/ui.js` (componentes: `toast(msg)`, `sheet({title, body, actions})`, `confirmSheet({title, text, verb, danger}) -> Promise<boolean>`, `skeleton(n)`, `emptyState({icon, text, action})`, `offlineBanner()`), `admin/admin.css`
- Modify: `excel_migrator.py` (`render_admin_shell(config) -> str`; escribir `docs/admin/index.html` con `rel_prefix="../"`; copiar `admin/*.js|css` a `docs/admin/`; `KNOWN_FILES`/limpieza incluye la carpeta `admin/`; ítem "⚙️ Administración" en `build_nav`)
- Test: `tests/test_generator_admin.py`, `tests/js/admin_router.test.js`

**Interfaces:**
- Consumes: `AdminLogic` (Usuarios T3), `window.__SUPABASE__` (config inyectada como en las demás páginas), `window.__TAG_INDEX__` (inyectarlo también en admin).
- Produces: `AdminRouter.routesFor(role) -> [{id, icon, label}]` y `AdminRouter.resolve(hash, role) -> {id, denied: boolean}` (puros, en `admin/app.js` exportables a node); registro de pantallas `Admin.register(id, {render(container, ctx)})` con `ctx = {client, session, profile: {full_name, role, active}, tags, toast, sheet, confirmSheet}`.

- [ ] **Step 1: Tests que fallan:** `routesFor('tecnico')` = `['resumen','registros','cuenta']`; `routesFor('oficina')` = `['resumen','registros','rutinas','equipos','mas']`; `resolve('#rutinas','tecnico')` → `{id:'resumen', denied:true}`; `resolve('','oficina')` → `resumen`. Generador: `docs/admin/index.html` existe con `noindex`, `src="app.js"`, sin `.sidebar`; `href="../admin/"` en una ficha, `href="admin/"` en el inicio.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. Login con "Mostrar contraseña" y "¿Olvidaste tu contraseña? Pedila a la oficina."; perfil desactivado → "Tu usuario está desactivado. Hablá con la oficina." y cierra sesión.
- [ ] **Step 4:** PASS (pytest + node).
- [ ] **Step 5:** Capturas 360/390/1280: login, shell oficina, shell técnico, aviso de sección denegada.
- [ ] **Step 6: Commit** `feat: /admin/ con login y navegación según perfil`.

---

### Task A2: 🏠 Resumen

**Files:** Create `admin/resumen.js` · Test `tests/js/admin_resumen.test.js`

**Interfaces:** Consumes `MaintStatus.classify/sortByUrgency` (Próximos T3), vista `maintenance_schedule`, `search_maintenance_records`. Produces `Resumen.buildCards(scheduleRows, today) -> {criticas, vencidas, nunca, proximas, equipos_afectados}` (pura).

- **Oficina:** 4 tarjetas grandes (🔴 Críticas · 🔴 Vencidas · 🟠 Sin registro · 🟡 Próximas 14 días), cada una abre Registros/Equipos ya filtrado; debajo "Equipos que necesitan atención" (máx. 5, chevron "Ver todos"); "Últimos registros" (5).
- **Técnico:** "Tu última actividad" (sus 5 registros), las mismas 4 tarjetas en solo lectura y botón grande "📝 Registrar mantenimiento" → selector de TAG con buscador → abre la ficha en `?registrar`.

- [ ] Tests de `buildCards` (con filas fijas de cada estado) → FAIL → implementar → PASS → capturas 360/390 de ambos perfiles → **Commit** `feat: resumen de administración por perfil`.

---

### Task A3: 🔧 Rutinas (oficina)

**Files:** Create `admin/rutinas.js` · Create `supabase/migrations/20261118130000_max_five_activities.sql` · Test `tests/supabase/test_max_five.py`, `tests/js/admin_rutinas.test.js`

**Interfaces:** Produces `Rutinas.freqOptions() -> [{label:'Mensual', weeks:4}, {label:'Bimestral',8}, {label:'Trimestral',13}, {label:'Semestral',26}, {label:'Anual',52}, {label:'Otra…', weeks:null}]`, `Rutinas.freqLabel(weeks) -> 'Trimestral' | 'Cada 6 semanas'`, `Rutinas.canAdd(activeCount) -> boolean` (máx. 5).

- Lista de tipos de equipo: tarjeta con nombre, "4/5 rutinas", TAGs asignados. Toque → detalle: rutinas con nombre, frecuencia (chip) e interruptor Activa. Editar = vista emergente (nombre, frecuencia con selector + "Otra…" en semanas, código automático desde el nombre). "＋ Rutina" deshabilitado con 5 activas ("Máximo 5 rutinas activas por tipo de equipo. Desactivá una para agregar otra."). "＋ Tipo de equipo" (nombre + horas/día con valor por defecto 24).
- Migración: trigger `before insert or update of active` en `maintenance_activities` que rechaza la 6.ª activa por `class_id` con mensaje `"Máximo 5 rutinas activas por tipo de equipo"`.

- [ ] Tests: `test_sexta_rutina_activa_rechazada`, `test_reactivar_sexta_rechazada`, `test_quinta_ok`; node: `freqLabel(13)==='Trimestral'`, `freqLabel(6)==='Cada 6 semanas'`, `canAdd(5)===false` → FAIL → implementar → PASS → aplicar migración local → capturas 360/390 (lista, detalle, editar, tope) → **Commit** `feat: rutinas por tipo de equipo desde la web`.

---

### Task A4: ⚙️ Equipos (oficina)

**Files:** Create `admin/equipos.js` · Test `tests/js/admin_equipos.test.js`

**Interfaces:** Consumes `window.__TAG_INDEX__`, tablas `equipment_tags`, `equipment_classes`. Produces `Equipos.pairOf(tag, tags) -> string|null` (detecta A/B por sufijo y `group_key`), `Equipos.unassigned(tagIndex, equipmentTags) -> tags`.

- Buscador por TAG o servicio; filtro chip "Sin tipo asignado (n)". Tarjeta: TAG, servicio, punto de estado, tipo (selector en vista emergente). Si tiene par: "Par: 100-P-01A ↔ 100-P-01B · cada uno con su historial". Cambiar tipo con registros → aviso del Review Focus 4.

- [ ] Tests de `pairOf` (`100-P-01A`→`100-P-01B`; `600-P-01`→`null`) y `unassigned` → FAIL → implementar → PASS → capturas 360/390 → **Commit** `feat: asignación de tipo de equipo por TAG desde la web`.

---

### Task A5: 📋 Registros

**Files:** Create `admin/registros.js` · Test `tests/js/admin_registros.test.js`

**Interfaces:** Consumes `MaintSearch.*`, `search_maintenance_records`, tablas `maintenance_records`, `maintenance_record_activities`, Storage firmado (lote por página). Produces `Registros.editableFields(record, profile) -> {fecha, descripcion, horas, rutinas, borrar}` (booleans: `oficina` todo; `tecnico` nada — solo ve y agrega comentario/adjunto a los suyos como en la ficha).

- Mismo buscador + "Filtros (n)" + chips + grupos por mes + cursor que el feed público (reusar `MaintSearch`). `tecnico`: filtro fijo "Autor: yo" con chip removible para ver todos. Tarjeta → detalle en vista emergente: fotos (carrusel), audio, rutinas, comentarios; `oficina`: "Editar" (fecha, descripción, horas HMI, rutinas del tipo del TAG) y "Borrar" con `confirmSheet` ("Borrar el registro del 8 oct de 100-P-01A. Las fotos se conservan como evidencia.").

- [ ] Tests de `editableFields` → FAIL → implementar → PASS → prueba local: editar fecha y quitar rutina recalcula la fecha tentativa (Review Focus 5) → capturas 360/390 (lista, filtros, detalle, editar, confirmar borrar) → **Commit** `feat: registros con búsqueda, edición y borrado desde la web`.

---

### Task A6: 👥 Usuarios y 🔑 Mi cuenta dentro del shell

**Files:** Create `admin/usuarios.js`, `admin/cuenta.js` (contenido funcional de la Task 4 del plan de usuarios, montado como pantallas del shell)

- Comportamiento y textos: los de la Task 4 de [2026-11-17-fase1-usuarios.md](2026-11-17-fase1-usuarios.md) (buscador, Activos/Desactivados, tarjetas, acciones con confirmación, ＋ Nuevo usuario, contraseña temporal una sola vez con Copiar y WhatsApp). "🔑 Mi cuenta": nombre, correo, perfil, "Cambiar mi contraseña", "Cerrar sesión".

- [ ] Prueba local contra la Edge Function (crear técnico, entrar con él, ver su navegación reducida, desactivarlo) → capturas 360/390 → **Commit** `feat: usuarios y mi cuenta en la administración web`.

---

### Task A7: Pulido y prueba de punta a punta

- [ ] Recorrer cada pantalla a 360/390/1280 con los dos perfiles y una lista de chequeo: sin scroll horizontal (`scrollWidth <= innerWidth`), toques ≥ 44 px, esqueletos y estados vacíos presentes, toasts, confirmaciones propias, banda "Sin conexión" (simular con `navigator.onLine=false`), sesión vencida devuelve al login sin perder el formulario abierto.
- [ ] Lighthouse móvil sobre `/admin/` (accesibilidad ≥ 90, buenas prácticas ≥ 90).
- [ ] Corregir lo encontrado. **Commit** `fix: pulido de la administración web`.

---

### Task A8: Publicar en FANALCA

- [ ] Con confirmación: `supabase db push --linked --dry-run` → `--yes`; `supabase functions deploy admin-users --project-ref bcpthbpbyyrlemvbrshp --use-api`.
- [ ] Regenerar `docs/`, `git status` completo, commit, push, chequeo de Pages (una línea).
- [ ] Capturas del sitio publicado a 360/390.
- [ ] **Con el usuario desde su celular:** entrar a `/admin/` como oficina; crear un técnico y compartir su clave por WhatsApp; entrar como ese técnico y ver solo su navegación; registrar en 400-MX-01 desde el Resumen; como oficina, cambiar una frecuencia, filtrar registros por rutina, editar y borrar uno; desactivar al técnico.
- [ ] `gui.py`: los botones 🧰 Mantenimientos y 📋 Plan muestran "Ahora se administra en la web" con el enlace a `/admin/` (la GUI queda solo para generar el sitio).

### Task A9: Instructivo DEXCO (después de la aprobación del usuario)

- [ ] `INSTRUCTIVO_DEXCO_MEJORAS_PTAR.md`: parte nueva "Administración web" (qué es, URL, perfiles, cómo desplegar migraciones + función, prueba de aceptación desde el celular, problemas encontrados); quitar las referencias a administrar desde `gui.py`. `CLAUDE.md`: sección "Administración web". Commit + push + chequeo de Pages.
