# Administración web con login de Supabase — diseño

Fecha: 2026-11-17 · Proyecto: FANALCA (`fanalca-rpci/fanalca-rpci`, Supabase `bcpthbpbyyrlemvbrshp`) · Se reutiliza tal cual en DEXCO Mejoras PTAR.

## Por qué

Hoy lo administrativo vive en `gui.py`, una app de escritorio que corre en un solo laptop (WSL + NiceGUI). En FANALCA van a administrar personas de **la planta** y de **RPCI**, cada una con su usuario, desde donde estén y casi siempre **desde el celular**. Además no existe forma de crear usuarios sin entrar al panel de Supabase.

**Éxito:** una persona con perfil `oficina` entra desde su celular a `https://fanalca-rpci.github.io/fanalca-rpci/admin.html`, crea un técnico nuevo, le asigna rutinas a un equipo y corrige un registro mal cargado, sin tocar Supabase ni un computador.

## Metas

1. **Usuarios:** crear (con perfil a elegir), cambiar perfil, restablecer contraseña, desactivar/reactivar. Cualquier usuario puede cambiar su propia contraseña.
2. **Rutinas por tipo de equipo:** crear/editar tipos de equipo y sus rutinas (máx. 5 por tipo), activar/desactivar.
3. **Equipos:** asignar a cada TAG su tipo de equipo y su par A/B.
4. **Registros:** buscar por TAG, editar y borrar registros de mantenimiento.

## No-metas (por ahora)

- **Calendario / agenda / reprogramar.** Se diseña después (ver "Después").
- **Generar o publicar el sitio** desde la web (leer el Excel, logo, color, `git push`). Sigue en `gui.py` local o con Claude. GitHub Pages no ejecuta Python.
- Crear perfiles nuevos además de `tecnico` y `oficina`.

## Anti-metas (sería un fracaso aunque funcione)

- Que algo **no se pueda usar con una mano en un celular de 360 px**: tablas anchas, botones chicos, texto cortado, scroll horizontal.
- Que la `service_role` (clave maestra) llegue al navegador o al repo.
- Que se **mezcle el historial** de dos TAGs de un par A/B o que se pierda historial al desactivar a un usuario.
- Que la seguridad dependa de esconder botones: la base (RLS) decide siempre.

## Usuarios y permisos

| Perfil | Quién | En el sitio | En Administración |
|---|---|---|---|
| `tecnico` | Operarios de planta | Registra mantenimientos y comenta los suyos | Solo "Cambiar mi contraseña" |
| `oficina` | Jefes de planta y RPCI | Todo lo del técnico | Todo |

- Planta y RPCI entran con **usuarios distintos**, de cualquier perfil. No hay un perfil aparte para RPCI.
- Un usuario **desactivado** no puede entrar, y si tenía la sesión abierta, la base igual le rechaza cualquier escritura. Su historial se conserva y su nombre sigue apareciendo en los registros.
- No se puede desactivar a sí mismo ni dejar la planta sin ningún `oficina` activo.

## Cómo funciona

```
Celular (admin.html + admin.js)
   │  login: supabase.auth (correo + contraseña)
   ├──► Supabase REST (anon key + sesión)  → rutinas, equipos, registros   [RLS: is_oficina()]
   └──► Edge Function `admin-users`         → crear / perfil / contraseña / desactivar
            │ verifica: sesión válida + perfil oficina activo
            └──► Auth Admin API (service_role SOLO aquí, variable del servidor) + tabla profiles
```

- **Mismo stack que el sitio:** HTML + CSS + JS simple + `supabase-js` UMD. Sin frameworks ni compilación, igual que `maintenance.js`.
- `admin.html` la genera `excel_migrator.py` como `mantenimientos.html` (banner, colores y logo de la planta). La lógica va en `admin.js` / `admin.css` en la raíz del repo, copiados a `docs/`.
- La lógica pura (validaciones, filtros, armado de listas) va en funciones sin DOM, con tests en `tests/js/`, como `maintenance_agenda.js`.
- **Edge Function `admin-users`** (`supabase/functions/admin-users/index.ts`, Deno) con las acciones `list`, `create`, `set_role`, `reset_password`, `deactivate`, `reactivate`. Retoma el diseño de D'Vida (`docs/superpowers/specs/2026-10-15-gui-usuarios-y-portabilidad-design.md`, Parte A).
- **Contraseña temporal:** la genera la función (formato `Ptar-xxxx-xxxx`). Se muestra **una sola vez**, con botones Copiar y "Compartir por WhatsApp", y la persona la cambia al entrar.

## Cambios en la base (una migración nueva, genérica para cualquier planta)

- `profiles.active boolean not null default true`.
- `is_member()` e `is_oficina()` exigen `active = true`.
- Tabla `user_admin_log` (quién, a quién, qué acción, cuándo). Solo `oficina` la lee; solo la función escribe.
- **Tope de 5 rutinas activas por tipo de equipo**, como trigger en `maintenance_activities`. Así ni la web ni el SQL pueden pasarse.
- Todo lo demás ya existe: `equipment_classes`, `maintenance_activities`, `equipment_tags`, RLS de catálogo solo para `oficina`, y borrar registros solo para `oficina`.

## Pantallas (celular primero)

**Patrón común:** barra de pestañas **abajo**, fija y alcanzable con el pulgar, con 4 secciones: 👥 Usuarios · 🔧 Rutinas · ⚙️ Equipos · 📋 Registros. Cada elemento es una **tarjeta**, no una fila de tabla. Los formularios van en una sola columna, con el botón Guardar fijo abajo. Los toques son de al menos 44 px. Cada acción delicada pide confirmación en lenguaje claro ("Juan no podrá entrar; su historial se conserva"). En escritorio es lo mismo, centrado a 720 px.

1. **Entrar:** correo + contraseña, con "Mostrar contraseña". Si el perfil es `tecnico`, ve solo "🔑 Cambiar mi contraseña" y un mensaje: "La administración es para perfil oficina".
2. **👥 Usuarios:** buscador por nombre o correo, y filtro Activos / Desactivados. Cada tarjeta muestra nombre, correo, perfil y estado. Al tocarla se ve: Cambiar perfil · Restablecer contraseña · Desactivar/Reactivar. Botón flotante **＋ Nuevo usuario** con nombre, correo y perfil, que luego muestra la contraseña temporal.
3. **🔧 Rutinas:** lista de tipos de equipo, cada uno con su número de rutinas ("4/5") y TAGs. Al tocar uno se ven sus rutinas, cada una con nombre, frecuencia de referencia e interruptor Activa. Con 5 activas, "＋ Rutina" se deshabilita y dice por qué. También permite ＋ Tipo de equipo.
4. **⚙️ Equipos:** buscador por TAG o servicio. Cada tarjeta muestra el TAG y el servicio, un selector de tipo de equipo y, si tiene par, "Par: 100-P-01A ↔ 100-P-01B" con el aviso **"Cada TAG del par tiene su propio historial"**. Los TAGs salen de `window.__TAG_INDEX__`, el mismo índice del sitio.
5. **📋 Registros:** buscador por TAG, como pidió el usuario: los registros tienen que ser fáciles de encontrar por TAG. Lista de 10 en 10 con "Cargar más", y cada tarjeta muestra fecha, autor, rutinas hechas y fotos. Desde ahí se edita (fecha, descripción, horas, rutinas) o se borra con confirmación. Los adjuntos no se borran del almacenamiento: quedan como evidencia, igual que hoy.

**"🔑 Cambiar mi contraseña"** también se agrega al sitio público, junto a "Cerrar sesión" en la ficha, para que los técnicos cambien la temporal desde el celular.

**Acceso:** el ítem "⚙️ Administración" va en el menú lateral del sitio, al final. No va en el banner, que ya está al límite en 360 px.

## Reutilización en otras plantas (DEXCO)

Todo es genérico. Por planta solo cambia el despliegue: `supabase db push` (la migración nueva) + `supabase functions deploy admin-users --project-ref <ref>`. Se agrega a `setup_supabase_planta.sh` y al instructivo de DEXCO.

## Pruebas

- **Edge Function** contra el stack local (`supabase start` + `supabase functions serve`, con Docker, que ya está en el laptop), usando pytest. `oficina` puede crear, listar, cambiar perfil, restablecer y desactivar. `tecnico` y anónimo reciben 403. No se puede desactivar el último oficina ni a sí mismo. Cada acción queda en `user_admin_log`.
- **RLS:** un usuario desactivado con la sesión abierta no puede insertar. No se puede crear una 6.ª rutina activa.
- **Lógica JS pura:** `node --test`.
- **Celular:** capturas con Chromium headless a **360 y 390 px**, más escritorio, de cada pantalla. Sin scroll horizontal ni textos cortados. Se prueba antes que escritorio.
- **En producción, con el usuario:** crear un técnico de prueba desde el celular, entrar con él, cambiar su contraseña y desactivarlo.

## Fases (un plan por fase)

1. **Usuarios:** migración, Edge Function, `admin.html` con login y 👥 Usuarios, y "Cambiar mi contraseña" en sitio y admin.
2. **Rutinas y Equipos:** pantallas 🔧 y ⚙️, y el tope de 5 en la base.
3. **Registros:** 📋 buscar por TAG, editar y borrar.

Al terminar cada fase se publica en FANALCA y se actualiza el instructivo de DEXCO.

## Decisiones del usuario (2026-11-17)

- Perfiles: `tecnico` registra; `oficina` hace lo administrativo y las utilidades futuras. Planta y RPCI entran con usuarios distintos.
- La administración va en línea, con login de Supabase y gestión completa de usuarios.
- Rutinas: 4 o 5 por tipo de equipo, mensuales o más espaciadas. Ya están cargadas (`supabase/datos/fanalca_rutinas.sql`).
- Celular siempre. Registros fáciles de encontrar por TAG. Los pares A/B tienen historial y calendario separados.
- El calendario queda para después.

## Decisiones mías (revisar)

- **Ocultar por ahora lo del calendario en el sitio** (pestañas "Programados" y "Plan" de la ficha, franja de vencidos del inicio y vista "Programados" de `mantenimientos.html`), con un interruptor `features.calendario: false` en `site_config.json`. Hoy muestran las rutinas como "sin registro" y pueden confundir a los técnicos. Se vuelven a encender con el calendario.
- Contraseña temporal generada por la función y compartible por WhatsApp, en lugar de que la oficina la invente.
- Desactivar en vez de borrar usuarios.
- `gui.py` se conserva para generar y publicar el sitio. Sus ventanas de Mantenimientos y Plan quedan como respaldo, sin nuevas funciones.

## Después: calendario

Se propondrá aparte. Los puntos de partida ya existen en la base (frecuencia por rutina, régimen titular/respaldo por TAG, horas del HMI) y el usuario adelantó que la titular y la de respaldo de un par A/B pueden tener calendarios distintos.
