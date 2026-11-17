# Administración web — Fase 1: Usuarios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una persona `oficina` entra desde el celular a `admin.html`, crea un usuario con el perfil elegido, le restablece la contraseña o lo desactiva; cualquier usuario cambia su propia contraseña; el calendario queda oculto en el sitio.

**Architecture:** `admin.html` la genera `excel_migrator.py` como `mantenimientos.html`; la lógica vive en `admin.js` (DOM) + `admin_logic.js` (pura, testeada con node). Todo lo que toca Auth pasa por la Edge Function `admin-users` (Deno, en Supabase), que tiene la `service_role` como variable del servidor y verifica que quien llama sea `oficina` activo. Una migración agrega `profiles.active`, endurece `is_member()/is_oficina()` y crea `user_admin_log`.

**Tech Stack:** HTML/CSS/JS vainilla + `@supabase/supabase-js@2` UMD (ya cargado por el sitio) · Supabase Edge Functions (Deno, `jsr:@supabase/supabase-js@2`) · Postgres/RLS · pytest + httpx contra `supabase start` · `node --test` · Chromium headless para capturas.

**Spec:** [specs/2026-11-17-administracion-web-design.md](../specs/2026-11-17-administracion-web-design.md)

## Global Constraints

- Español en todo: textos de UI, errores, logs, commits. Logs de Python con emojis (✅ ❌ 📄).
- **Celular primero:** cada pantalla se verifica a **360 y 390 px** antes que escritorio; toques ≥ 44 px; una columna; botón principal fijo abajo; sin scroll horizontal ni texto cortado; escritorio centrado a máx. 720 px.
- La `service_role` **nunca** en el navegador, el repo ni `site_config.json`; solo `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` dentro de la función.
- Perfiles válidos: exactamente `tecnico` y `oficina`.
- Contraseña temporal: formato `Ptar-xxxx-xxxx`, mostrada **una sola vez** con Copiar y Compartir por WhatsApp.
- Desactivar, nunca borrar usuarios. No se puede desactivar a sí mismo ni quitar el último `oficina` activo.
- RLS decide: ocultar botones no es seguridad.
- Rama `master`. Después de cada push: un solo `gh run watch … --exit-status` en segundo plano y reportar una línea.
- Migraciones nuevas se aplican en FANALCA con `supabase db push --linked` (historial sincronizado); en local con `psql … -f`.

## Review Focus

1. **Correo con mayúsculas o espacios** (`" Juan@Planta.com "`) → se normaliza a minúsculas sin espacios antes de crear y antes de comparar duplicados; no crea dos cuentas para la misma persona. *(test en Task 2 y Task 3)*
2. **Sesión vencida mientras está abierta la pantalla de admin** → la función responde 401 y la pantalla vuelve al login con "Tu sesión expiró, entrá de nuevo", sin perder lo escrito en el formulario de nuevo usuario. *(Task 4: `adminErrorMessage(401)`)*
3. **Oficina se quita su propio perfil oficina** (`set_role` a `tecnico` sobre sí mismo siendo el último) → 409 con mensaje claro; si no es el último, se permite y la pantalla cae a la vista de técnico. *(Task 2)*
4. **Sin red en el celular al crear** → mensaje "Sin conexión, no se creó el usuario", el formulario conserva los datos y el botón se rehabilita; nunca se muestra una contraseña temporal si la creación no se confirmó. *(Task 4: `adminErrorMessage(0)`)*
5. **Usuario desactivado que todavía tiene sesión abierta en la ficha** → la base rechaza su registro (RLS) y el sitio muestra el error normal, no un registro fantasma. *(Task 1)*

---

### Task 1: Migración — usuarios activos y bitácora de administración

**Files:**
- Create: `supabase/migrations/20261117120000_user_admin.sql`
- Test: `tests/supabase/test_user_admin_db.py`

**Interfaces:**
- Produces: columna `public.profiles.active boolean not null default true`; `public.is_member()` y `public.is_oficina()` devuelven `false` si `active = false`; tabla `public.user_admin_log(id uuid pk default gen_random_uuid(), actor_id uuid not null references auth.users, target_id uuid references auth.users, action text not null check (action in ('create','set_role','reset_password','deactivate','reactivate')), detail jsonb not null default '{}', created_at timestamptz not null default now())` con RLS: `select` solo `is_oficina()`, sin policies de insert/update/delete (solo `service_role` escribe).
- Nota: `is_member()`/`is_oficina()` se redefinen con `create or replace` (mismas firmas, `language sql stable`).

- [ ] **Step 1: Tests que fallan** en `tests/supabase/test_user_admin_db.py` (usa fixtures de `conftest.py`):
  - `test_desactivado_con_sesion_abierta_no_puede_registrar`: `tecnico_client` ya logueado; `service_client` pone `active=false` a `tecnico_id`; insertar en `maintenance_records` con `random_tag_id` → lanza `APIError`. Al final (`finally`) volver `active=true`.
  - `test_oficina_desactivado_pierde_is_oficina`: `oficina_client.rpc('is_oficina')` → `True`; desactivar; → `False`; reactivar.
  - `test_bitacora_solo_lectura_oficina`: `service_client` inserta una fila (`actor_id=oficina_id`, `action='create'`); `oficina_client.table('user_admin_log').select('*')` la ve; `tecnico_client` recibe `[]`; `tecnico_client` insertando → `APIError`.
- [ ] **Step 2: Correr y ver que fallan**
  Run: `python3 -m pytest tests/supabase/test_user_admin_db.py -v` (con `supabase start` y `.env.test`)
  Expected: FAIL (`column "active" does not exist` / relación inexistente).
- [ ] **Step 3: Escribir la migración** con lo de *Produces*.
- [ ] **Step 4: Aplicar en local y correr**
  Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261117120000_user_admin.sql && python3 -m pytest tests/supabase -q`
  Expected: los 3 nuevos PASS y la suite completa sigue en verde.
- [ ] **Step 5: Commit**
  `git add supabase/migrations/20261117120000_user_admin.sql tests/supabase/test_user_admin_db.py && git commit -m "feat: usuarios activos y bitácora de administración"`

---

### Task 2: Edge Function `admin-users`

**Files:**
- Create: `supabase/functions/admin-users/index.ts`
- Modify: `supabase/config.toml` (bloque `[functions.admin-users]` con `verify_jwt = true`)
- Test: `tests/supabase/test_admin_users_fn.py`

**Interfaces:**
- Consumes: Task 1 (`profiles.active`, `user_admin_log`).
- Produces: `POST {SUPABASE_URL}/functions/v1/admin-users`, headers `Authorization: Bearer <access_token del usuario>`, `apikey: <anon>`, body JSON `{action, ...}`. Respuesta siempre `{"ok": true, "data": …}` o `{"ok": false, "error": "<mensaje en español para mostrar tal cual>"}`.

| action | body | data | errores |
|---|---|---|---|
| `list` | — | `[{user_id, email, full_name, role, active, last_sign_in_at, created_at}]` ordenado por `full_name` | |
| `create` | `{email, full_name, role}` | `{user_id, temp_password}` | 400 datos inválidos · 409 correo ya existe |
| `set_role` | `{user_id, role}` | `{}` | 409 último oficina activo |
| `reset_password` | `{user_id}` | `{temp_password}` | 404 |
| `deactivate` | `{user_id}` | `{}` | 409 a sí mismo / último oficina activo |
| `reactivate` | `{user_id}` | `{}` | 404 |

  Comunes: 401 sin sesión válida · 403 si quien llama no es `oficina` activo · 400 acción desconocida · `OPTIONS` responde 200 con CORS (`Access-Control-Allow-Origin: *`, headers `authorization, apikey, content-type, x-client-info`).
  Reglas: correo `trim().toLowerCase()`; `full_name` 1–80 caracteres tras `trim`; contraseña `Ptar-` + 4 + `-` + 4 caracteres de `abcdefghjkmnpqrstuvwxyz23456789` con `crypto.getRandomValues`; `create` usa `auth.admin.createUser({email, password, email_confirm: true})` + insert en `profiles` (si el insert falla, borrar el usuario de Auth recién creado); `deactivate` = `auth.admin.updateUserById(id, {ban_duration: '876000h'})` + `active=false`; `reactivate` = `ban_duration: 'none'` + `active=true`; cada acción exitosa que cambia algo inserta en `user_admin_log` (`detail` sin contraseñas).

- [ ] **Step 1: Tests que fallan** en `tests/supabase/test_admin_users_fn.py`. Helper `call(client_or_none, action, **body) -> httpx.Response` que arma la URL y el token de la sesión del client (`client.auth.get_session().access_token`). Usar correos `f"fn-{uuid4().hex[:8]}@test.local"`.
  - `test_anonimo_401`, `test_tecnico_403` (`list`).
  - `test_oficina_crea_usuario_con_perfil`: `create` con `email=" Nuevo@Test.Local "`, `role='tecnico'` → 200, `temp_password` matchea `^Ptar-[a-z2-9]{4}-[a-z2-9]{4}$`; ese correo en minúsculas inicia sesión con esa contraseña; `profiles` tiene `role='tecnico'`, `active=True`.
  - `test_correo_duplicado_409` (mismo correo con otra capitalización).
  - `test_datos_invalidos_400`: `role='admin'`, `full_name='   '`, `email='sin-arroba'`.
  - `test_reset_password_cambia_la_clave`: la vieja ya no entra, la nueva sí.
  - `test_desactivar_bloquea_login_y_reactivar_lo_devuelve`.
  - `test_no_puede_desactivarse_a_si_mismo_409`.
  - `test_no_quita_el_ultimo_oficina_409`: con un oficina temporal creado por la función, desactivar a todos los demás oficina activos vía `service_client` (guardar y restaurar en `finally`) → `set_role` del último a `tecnico` → 409.
  - `test_cada_accion_queda_en_bitacora`: tras `create` + `deactivate`, `user_admin_log` (vía `service_client`) tiene ambas filas con `actor_id=oficina_id` y `detail` sin la clave `password`/`temp_password`.
  - `test_list_trae_nombre_perfil_y_estado`.
- [ ] **Step 2: Correr y ver que fallan**
  Run: `supabase functions serve admin-users --env-file .env.test &` y `python3 -m pytest tests/supabase/test_admin_users_fn.py -v`
  Expected: FAIL (404 de la función).
- [ ] **Step 3: Implementar `index.ts`** según la tabla. Verificación del llamador: cliente con `SUPABASE_ANON_KEY` + header `Authorization` del request → `auth.getUser()`; luego `profiles` vía cliente `service_role` exigiendo `role='oficina' and active`.
- [ ] **Step 4: Correr**
  Run: `python3 -m pytest tests/supabase -q`
  Expected: todo PASS.
- [ ] **Step 5: Commit**
  `git add supabase/functions/admin-users supabase/config.toml tests/supabase/test_admin_users_fn.py && git commit -m "feat: Edge Function admin-users"`

---

### Task 3: Lógica pura de administración (`admin_logic.js`)

**Files:**
- Create: `admin_logic.js`
- Test: `tests/js/admin_logic.test.js`

**Interfaces:**
- Produces (en `window.AdminLogic` y `module.exports`, mismo patrón que `maintenance_agenda.js`):
  - `normalizeEmail(s: string) -> string`
  - `validateNewUser({email, full_name, role}) -> {ok: boolean, errors: {email?, full_name?, role?}}` (mensajes en español)
  - `validateNewPassword(pwd, confirm) -> {ok, error?}` — mínimo 8 caracteres, iguales.
  - `filterUsers(users, query, status: 'activos'|'desactivados') -> users` — busca en nombre y correo sin tildes ni mayúsculas.
  - `roleLabel(role) -> 'Técnico' | 'Oficina'`
  - `whatsappShareUrl({full_name, email, temp_password, admin_url}) -> string` — `https://wa.me/?text=` + mensaje codificado.
  - `adminErrorMessage(status: number, serverMsg?: string) -> string` — 0 → "Sin conexión. No se guardó nada; intentá de nuevo."; 401 → "Tu sesión expiró. Entrá de nuevo."; 403 → "Tu usuario no tiene perfil oficina."; otro → `serverMsg` o "Algo falló. Intentá de nuevo."

- [ ] **Step 1: Tests que fallan**, uno por función, con estos casos fijos:
  - `normalizeEmail(' Juan@Planta.COM ') === 'juan@planta.com'`
  - `validateNewUser({email:'x', full_name:'', role:'admin'}).errors` tiene las tres claves; con `{email:'a@b.co', full_name:'Ana', role:'tecnico'}` → `ok: true`.
  - `validateNewPassword('corta','corta').ok === false`; `('Segura123','Otra1234').ok === false`; `('Segura123','Segura123').ok === true`.
  - `filterUsers` con `[{full_name:'José Pérez', email:'jp@x.co', active:true}, {full_name:'Ana', email:'ana@x.co', active:false}]`: `'jose'`/`'activos'` → José; `''`/`'desactivados'` → Ana.
  - `whatsappShareUrl` empieza con `https://wa.me/?text=` y decodificado contiene el correo, la contraseña y `admin_url`.
  - `adminErrorMessage(0)`, `(401)`, `(403)`, `(409,'Ese correo ya existe')` devuelven los textos de arriba.
- [ ] **Step 2:** `node --test tests/js/*.test.js` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `admin_logic.js`.
- [ ] **Step 4:** `node --test tests/js/*.test.js` → PASS (incluidos los 28 existentes).
- [ ] **Step 5: Commit** `git commit -m "feat: lógica pura de administración"` (con los dos archivos).

---

### Task 4: Página `admin.html` — login y 👥 Usuarios

**Files:**
- Create: `admin.js`, `admin.css`
- Modify: `excel_migrator.py` — `KNOWN_FILES` y la copia de estáticos (agregar `admin.js`, `admin.css`, `admin_logic.js`, `admin.html`); `build_nav(..., admin_active: bool = False)` agrega al final `<li class="nav-admin"><a class="nav-link-admin" href="{rel_prefix}admin.html">⚙️ Administración</a></li>`; nueva `render_admin_page() -> str`; generar `admin.html` con `page_skeleton(..., extra_head='<meta name="robots" content="noindex"><link rel="stylesheet" href="admin.css">', extra_scripts='<script src="admin_logic.js"></script><script src="admin.js"></script>')`.
- Test: `tests/test_generator_admin.py`

**Interfaces:**
- Consumes: Task 2 (contrato de la función), Task 3 (`AdminLogic.*`), `window.__SUPABASE__`/cliente igual que `maintenance.js` (`window.supabase.createClient(cfg.url, cfg.anonKey)` — mismo origen, la sesión se comparte con la ficha).
- Produces: `admin.html` con `<main id="admin-app">`; barra de pestañas inferior con 👥 Usuarios y 🔑 Mi cuenta (las de fases 2–3 se agregan entonces, no se muestran deshabilitadas).

Comportamiento (copiar textos tal cual):
- Sin sesión → formulario correo + contraseña + "Mostrar contraseña" + botón "Entrar".
- Sesión `tecnico` → solo 🔑 Mi cuenta + aviso "La administración es para perfil oficina."
- Sesión `oficina` → 👥 Usuarios: buscador "Buscar por nombre o correo", selector Activos | Desactivados, tarjetas (nombre, correo, chip de perfil, "Desactivado" si aplica). Tocar tarjeta → acciones: Cambiar perfil · Restablecer contraseña · Desactivar / Reactivar, cada una con confirmación ("Juan no podrá entrar; su historial se conserva.").
- Botón flotante "＋ Nuevo usuario" → formulario (nombre, correo, perfil) con "Crear usuario" fijo abajo → pantalla "Usuario creado" con la contraseña temporal en grande, "Copiar", "Compartir por WhatsApp" (`whatsappShareUrl`) y el aviso "Esta contraseña no se vuelve a mostrar."
- Errores con `adminErrorMessage`; ante 401 vuelve al login **conservando** lo escrito en el formulario de nuevo usuario.

- [ ] **Step 1: Tests que fallan** en `tests/test_generator_admin.py` (fixture `site` igual a `tests/test_generator_feed.py`):
  - `test_admin_page_existe_con_scripts_y_noindex`: `admin.html` contiene `id="admin-app"`, `src="admin_logic.js"`, `src="admin.js"`, `name="robots" content="noindex"`.
  - `test_estaticos_admin_copiados`: `admin.js`, `admin.css`, `admin_logic.js` existen en el sitio.
  - `test_link_admin_en_todos_los_niveles`: `href="admin.html"` en `index.html`; `href="../admin.html"` en `equipos/100-P-01A.html` y `equipos/index.html`.
- [ ] **Step 2:** `python3 -m pytest tests/test_generator_admin.py -v` → FAIL.
- [ ] **Step 3:** Cambios en `excel_migrator.py` + `admin.js` + `admin.css`.
- [ ] **Step 4:** `python3 -m pytest -q tests --ignore=tests/supabase && node --test tests/js/*.test.js` → PASS.
- [ ] **Step 5: Verificación en celular contra Supabase local** (generar a `/tmp/<scratch>/site`, reemplazar URL/anon key por las de `.env.test`, servir con `python3 -m http.server`; crear un usuario de verdad contra la función local). Capturas con Chromium headless a 360, 390 y 1280 px de: login, lista de usuarios, formulario nuevo, pantalla "Usuario creado". Criterio: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`), nada cortado, botón principal visible sin hacer scroll.
- [ ] **Step 6: Commit** `git commit -m "feat: admin.html con login y gestión de usuarios"`.

---

### Task 5: 🔑 Cambiar mi contraseña (sitio y admin)

**Files:**
- Modify: `maintenance.js` (`renderLoggedInShell`: con sesión, botón "🔑 Contraseña" junto a "Cerrar sesión"), `admin.js` (pestaña 🔑 Mi cuenta), `excel_migrator.py` (`page_skeleton` carga `admin_logic.js` en **todas** las páginas, antes de `maintenance.js`)
- Test: `tests/test_generator_admin.py` (agregar)

**Interfaces:**
- Consumes: `AdminLogic.validateNewPassword`, `adminErrorMessage`.
- Produces: diálogo único "Cambiar mi contraseña" (nueva + confirmar + "Mostrar") que llama `client.auth.updateUser({password})`; éxito → "Listo, tu contraseña cambió." En la ficha usa el modal existente (`.maint-modal`).

- [ ] **Step 1: Test que falla** `test_admin_logic_en_todas_las_paginas`: `src="../admin_logic.js"` aparece antes de `src="../maintenance.js"` en `equipos/100-P-01A.html`; `src="admin_logic.js"` en `index.html`.
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** pytest + node → PASS; verificación manual local: técnico cambia su clave desde la ficha a 360 px y vuelve a entrar con la nueva.
- [ ] **Step 5: Commit** `git commit -m "feat: cambiar mi contraseña desde la ficha y la administración"`.

---

### Task 6: Ocultar el calendario en el sitio (`features.calendario`)

**Files:**
- Modify: `excel_migrator.py` (lee `config.get("features", {}).get("calendario", False)`; `page_skeleton` inyecta `<script>window.__FEATURES__ = {"calendario": false};</script>` antes de los scripts; `render_home` omite el `<a id="home-overdue">` si es `False`), `maintenance.js` (si `!window.__FEATURES__.calendario`: `buildTabs` solo con **Realizados**, sin `renderUpcoming`/`renderPlan` ni aviso "🔴 N vencidos"), `maintenance_feed.js` (sin selector Realizados|Programados; ignora `?vista=programados`), `site_config.json` (`"features": {"calendario": false}`)
- Test: `tests/test_generator_admin.py` (agregar), `tests/test_generator_feed.py` (ajustar si alguna aserción depende del selector)

- [ ] **Step 1: Tests que fallan:** `test_features_calendario_apagado_por_defecto` (`window.__FEATURES__ = {"calendario": false}` en `index.html` y en una ficha; `id="home-overdue"` ausente en `index.html`) y `test_features_calendario_encendido` (generar con config que tenga `"calendario": true` → `home-overdue` presente).
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** pytest + node → PASS; captura a 390 px de una ficha con sesión: solo la pestaña Realizados y el botón de registrar.
- [ ] **Step 5: Commit** `git commit -m "feat: interruptor features.calendario (apagado mientras se diseña el calendario)"`.

---

### Task 7: Publicar en FANALCA y dejarlo reutilizable para DEXCO

**Files:**
- Modify: `setup_supabase_planta.sh` (después de `db push`: `supabase functions deploy admin-users --project-ref "$REF" --use-api`), `INSTRUCTIVO_DEXCO_MEJORAS_PTAR.md` (Parte 9: cómo desplegar y probar la administración), `CLAUDE.md` (sección corta "Administración web" con archivos, función y fases)

- [ ] **Step 1:** Con confirmación del usuario: `supabase db push --linked --dry-run` (debe listar solo `20261117120000_user_admin.sql`) y luego `supabase db push --linked --yes`.
- [ ] **Step 2:** `supabase functions deploy admin-users --project-ref bcpthbpbyyrlemvbrshp --use-api` → `supabase functions list --project-ref bcpthbpbyyrlemvbrshp` muestra `admin-users` ACTIVE.
- [ ] **Step 3:** Humo en producción con `curl`: sin token → 401; con la sesión de un `oficina` real lo hace el usuario en el paso 6.
- [ ] **Step 4:** `python3 excel_migrator.py plantilla_sitio.xlsx docs/`, `git status` completo revisado, commit, push y el chequeo de una línea de Pages.
- [ ] **Step 5:** Capturas finales del sitio publicado a 360/390 px (login de admin y ficha).
- [ ] **Step 6: Prueba con el usuario desde su celular:** entrar a `admin.html` con `innovacion@rpci.com.co`, crear un técnico de prueba, compartir la clave por WhatsApp, entrar con él en una ficha, cambiarle la contraseña, registrar un mantenimiento, y desactivarlo desde admin → ya no entra.
- [ ] **Step 7: Commit** de docs (`setup_supabase_planta.sh`, instructivo, `CLAUDE.md`) + push + chequeo de Pages.
