// Administración web (/admin/). JS vainilla + supabase-js UMD.
// Lógica pura en ../admin_logic.js (window.AdminLogic). RLS decide siempre:
// esta capa solo elige qué mostrar según el perfil.
(function () {
    'use strict';

    var L = window.AdminLogic;
    var cfg = window.__SUPABASE_CONFIG__ || {};
    var TAGS = window.__TAG_INDEX__ || [];
    var client = window.supabase.createClient(cfg.url, cfg.anonKey);
    var FN_URL = cfg.url + '/functions/v1/admin-users';
    var ADMIN_URL = location.origin + location.pathname.replace(/[^/]*$/, '');
    var SITE_ROOT = ADMIN_URL.replace(/admin\/$/, '');
    var PAGE = 20;
    var FREQS = [
        { weeks: 4, label: 'Mensual' }, { weeks: 8, label: 'Bimestral' }, { weeks: 13, label: 'Trimestral' },
        { weeks: 26, label: 'Semestral' }, { weeks: 52, label: 'Anual' },
    ];

    var REGIMES = {
        normal: 'Independiente (cada uno según su uso)', principal: 'Titular (trabaja normalmente)',
        reserva: 'Respaldo (entra solo si falla el titular)', alterna: 'Alternan (se turnan el trabajo)',
    };
    var app = document.getElementById('admin-app');
    var nav = document.getElementById('adm-nav');
    var state = { session: null, profile: null, draft: {} };

    // ── utilidades ────────────────────────────────────────────────────────
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function el(html) {
        var t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstElementChild;
    }
    function freqLabel(weeks, hours) {
        var f = FREQS.filter(function (x) { return x.weeks === weeks; })[0];
        var w = f ? f.label : (weeks ? 'Cada ' + weeks + ' semanas' : '');
        var h = hours ? 'cada ' + Number(hours).toLocaleString('es-CO') + ' h' : '';
        if (w && h) return w + ' o ' + h;
        return w || (h ? h.charAt(0).toUpperCase() + h.slice(1) : 'Sin frecuencia');
    }
    function slug(s) {
        return L.fold(s).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'RUTINA';
    }
    function tagInfo(tag) {
        return TAGS.filter(function (t) { return t.tag === tag; })[0] || { tag: tag, servicio: '', categoria: '' };
    }
    function fichaUrl(tag) {
        var t = tagInfo(tag);
        return t.filename ? SITE_ROOT + t.categoria.toLowerCase() + '/' + t.filename : SITE_ROOT;
    }

    var libs = {};
    function loadLib(url) {
        if (!libs[url]) {
            libs[url] = new Promise(function (resolve, reject) {
                var sc = document.createElement('script');
                sc.src = url; sc.onload = resolve; sc.onerror = function () { delete libs[url]; reject(new Error('Sin conexión')); };
                document.head.appendChild(sc);
            });
        }
        return libs[url];
    }
    var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    var QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

    function shrinkImage(file, max) {
        return new Promise(function (resolve) {
            if (!/^image\/(jpeg|png|webp)/.test(file.type)) return resolve(file);
            var img = new Image();
            img.onload = function () {
                var k = Math.min(1, max / Math.max(img.width, img.height));
                var c = document.createElement('canvas');
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                c.toBlob(function (b) { URL.revokeObjectURL(img.src); resolve(b || file); }, 'image/jpeg', 0.75);
            };
            img.onerror = function () { resolve(file); };
            img.src = URL.createObjectURL(file);
        });
    }

    var sabana = null;
    function loadSabana() {
        if (!sabana) sabana = fetch('sabana_base.json').then(function (r) { return r.ok ? r.json() : { classes: [], activities: [] }; })
            .catch(function () { return { classes: [], activities: [] }; });
        return sabana;
    }

    var toastTimer = null;
    function toast(msg, kind) {
        var box = document.getElementById('adm-toast');
        box.textContent = msg;
        box.className = 'adm-toast' + (kind === 'error' ? ' is-error' : '');
        box.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { box.hidden = true; }, kind === 'error' ? 5000 : 3000);
    }

    function sheet(opts) {
        var wrap = el('<div class="adm-sheet-wrap"><div class="adm-sheet-dim"></div>' +
            '<section class="adm-sheet" role="dialog" aria-modal="true">' +
            '<div class="adm-sheet-grab"></div>' +
            '<header class="adm-sheet-head"><h2></h2><button type="button" class="adm-icon-btn" aria-label="Cerrar">✕</button></header>' +
            '<div class="adm-sheet-body"></div><footer class="adm-sheet-foot"></footer></section></div>');
        wrap.querySelector('h2').textContent = opts.title;
        var body = wrap.querySelector('.adm-sheet-body');
        if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
        var foot = wrap.querySelector('.adm-sheet-foot');
        (opts.actions || []).forEach(function (a) { foot.appendChild(a); });
        if (!opts.actions || !opts.actions.length) foot.remove();
        function close() { wrap.remove(); document.body.classList.remove('adm-lock'); document.removeEventListener('keydown', onKey); }
        function onKey(e) { if (e.key === 'Escape') close(); }
        wrap.querySelector('.adm-sheet-dim').addEventListener('click', close);
        wrap.querySelector('.adm-sheet-head button').addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        document.body.appendChild(wrap);
        document.body.classList.add('adm-lock');
        var first = wrap.querySelector('input, select, textarea');
        if (first && opts.focus !== false) setTimeout(function () { first.focus(); }, 50);
        return { el: wrap, body: body, close: close };
    }

    function button(label, cls, onClick) {
        var b = el('<button type="button" class="adm-btn ' + (cls || '') + '"></button>');
        b.textContent = label;
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }

    function confirmSheet(title, text, verb, danger) {
        return new Promise(function (resolve) {
            var done = false;
            var s;
            var ok = button(verb, danger ? 'is-danger' : 'is-primary', function () { done = true; s.close(); resolve(true); });
            var cancel = button('Cancelar', 'is-ghost', function () { s.close(); });
            s = sheet({ title: title, body: '<p class="adm-confirm-text">' + esc(text) + '</p>', actions: [cancel, ok], focus: false });
            var obs = new MutationObserver(function () { if (!document.body.contains(s.el)) { obs.disconnect(); if (!done) resolve(false); } });
            obs.observe(document.body, { childList: true });
        });
    }

    function skeleton(n) {
        var html = '<div class="adm-skel" aria-hidden="true">';
        for (var i = 0; i < (n || 4); i++) html += '<div class="adm-skel-card"></div>';
        return html + '</div>';
    }

    function empty(icon, text) {
        return '<div class="adm-empty"><div class="adm-empty-icon">' + icon + '</div><p>' + esc(text) + '</p></div>';
    }

    function busy(btn, on, label) {
        if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Guardando…'; btn.disabled = true; }
        else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
    }

    function dbError(err) {
        if (!navigator.onLine) return L.adminErrorMessage(0);
        var msg = (err && err.message) || '';
        if (/JWT|expired|session/i.test(msg)) return L.adminErrorMessage(401);
        if (/row-level security|permission/i.test(msg)) return 'No tenés permiso para hacer esto.';
        if (/Máximo 5/.test(msg)) return 'Máximo 5 rutinas activas por tipo de equipo.';
        return L.adminErrorMessage(500);
    }

    // ── Edge Function de usuarios ─────────────────────────────────────────
    function callUsers(action, body) {
        return client.auth.getSession().then(function (r) {
            var token = r.data.session && r.data.session.access_token;
            return fetch(FN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token },
                body: JSON.stringify(Object.assign({ action: action }, body || {})),
            });
        }).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (json) {
                if (res.ok && json.ok) return json.data;
                var e = new Error(L.adminErrorMessage(res.status, json.error));
                e.status = res.status;
                throw e;
            });
        }, function () {
            var e = new Error(L.adminErrorMessage(0));
            e.status = 0;
            throw e;
        });
    }

    function onAuthError(e) {
        toast(e.message, 'error');
        if (e.status === 401) client.auth.signOut().then(showLogin);
    }

    // ── login / sesión ────────────────────────────────────────────────────
    function showLogin(message) {
        nav.hidden = true;
        state.profile = null;
        app.innerHTML = '';
        var form = el('<form class="adm-login" novalidate>' +
            '<h1>Entrar</h1><p class="adm-muted">Usá el correo y la contraseña que te dio la oficina.</p>' +
            (message ? '<p class="adm-alert">' + esc(message) + '</p>' : '') +
            '<label class="adm-field"><span>Correo</span><input type="email" name="email" autocomplete="username" inputmode="email" required></label>' +
            '<label class="adm-field"><span>Contraseña</span><input type="password" name="password" autocomplete="current-password" required></label>' +
            '<label class="adm-check"><input type="checkbox" name="show"> Mostrar contraseña</label>' +
            '<p class="adm-error" hidden></p>' +
            '<button type="submit" class="adm-btn is-primary is-block">Entrar</button>' +
            '<p class="adm-muted adm-center">¿Olvidaste tu contraseña? Pedila a la oficina.</p></form>');
        var pwd = form.querySelector('[name=password]');
        form.querySelector('[name=show]').addEventListener('change', function (e) { pwd.type = e.target.checked ? 'text' : 'password'; });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var err = form.querySelector('.adm-error');
            var btn = form.querySelector('[type=submit]');
            err.hidden = true;
            busy(btn, true, 'Entrando…');
            client.auth.signInWithPassword({ email: L.normalizeEmail(form.email.value), password: pwd.value })
                .then(function (r) {
                    busy(btn, false);
                    if (r.error) {
                        err.textContent = navigator.onLine ? 'Correo o contraseña incorrectos.' : L.adminErrorMessage(0);
                        err.hidden = false;
                        return;
                    }
                    boot();
                });
        });
        app.appendChild(form);
    }

    function loadProfile(session) {
        return client.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
            .then(function (r) { return r.data; });
    }

    function boot() {
        app.innerHTML = skeleton(3);
        client.auth.getSession().then(function (r) {
            var session = r.data.session;
            if (!session) return showLogin();
            state.session = session;
            return loadProfile(session).then(function (profile) {
                if (!profile) {
                    return client.auth.signOut().then(function () {
                        showLogin('Tu usuario todavía no tiene perfil. Pedile a la oficina que te lo asigne.');
                    });
                }
                if (profile.active === false) {
                    return client.auth.signOut().then(function () {
                        showLogin('Tu usuario está desactivado. Hablá con la oficina.');
                    });
                }
                state.profile = profile;
                renderNav();
                route();
            });
        }).catch(function () { showLogin(L.adminErrorMessage(0)); });
    }

    // ── navegación ────────────────────────────────────────────────────────
    function renderNav() {
        var routes = L.routesFor(state.profile.role);
        nav.innerHTML = routes.map(function (r) {
            var label = r.id === 'registros' && state.profile.role === 'tecnico' ? 'Mis registros' : r.label;
            return '<a href="#' + r.id + '" data-id="' + r.id + '"><span class="adm-nav-icon">' + r.icon + '</span><span>' + esc(label) + '</span></a>';
        }).join('');
        nav.hidden = false;
    }

    function route() {
        if (!state.profile) return;
        var res = L.resolve(location.hash, state.profile.role);
        var navId = res.id === 'usuarios' || res.id === 'sitio' || res.id === 'qr' || (res.id === 'cuenta' && state.profile.role === 'oficina') ? 'mas' : res.id;
        Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) {
            a.classList.toggle('is-active', a.dataset.id === navId);
            if (a.dataset.id === navId) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        window.scrollTo(0, 0);
        app.innerHTML = '';
        if (res.denied) app.appendChild(el('<p class="adm-alert">Esa sección es para perfil oficina.</p>'));
        var screen = SCREENS[res.id];
        var box = document.createElement('div');
        app.appendChild(box);
        screen(box);
    }

    // ── 🏠 Resumen ────────────────────────────────────────────────────────
    function screenResumen(box) {
        var p = state.profile;
        box.innerHTML = '<h1 class="adm-h1">Hola, ' + esc(p.full_name.split(' ')[0]) + '</h1>' +
            '<p class="adm-muted">' + esc(L.roleLabel(p.role)) + ' · ' + esc((window.__SITE__ || {}).plant || '') + '</p>' +
            '<div id="res-cards">' + skeleton(2) + '</div>' +
            '<a class="adm-btn is-primary is-block" id="res-registrar" href="#">📝 Registrar mantenimiento</a>' +
            '<h2 class="adm-h2">Últimos registros</h2><div id="res-last">' + skeleton(3) + '</div>';
        box.querySelector('#res-registrar').addEventListener('click', function (e) { e.preventDefault(); pickTagToRegister(); });

        client.from('maintenance_schedule').select('tag_id,status').then(function (r) {
            var rows = r.data || [];
            var tagSet = {};
            TAGS.forEach(function (t) { tagSet[t.tag] = true; });
            rows = rows.filter(function (x) { return tagSet[x.tag_id]; });
            function count(st) { return rows.filter(function (x) { return x.status === st; }).length; }
            var affected = {};
            rows.forEach(function (x) { if (x.status === 'vencido') affected[x.tag_id] = true; });
            box.querySelector('#res-cards').innerHTML =
                '<div class="adm-stats">' +
                stat('is-red', count('vencido'), 'Rutinas vencidas') +
                stat('is-orange', count('sin_registro'), 'Sin registro') +
                stat('is-yellow', count('proximo'), 'Próximas 14 días') +
                stat('is-green', Object.keys(affected).length, 'Equipos con vencidas') +
                '</div>';
        });
        var q = recordsQuery().limit(5);
        if (p.role === 'tecnico') q = q.eq('created_by', state.session.user.id);
        q.then(function (r) {
            var list = box.querySelector('#res-last');
            if (r.error) { list.innerHTML = '<p class="adm-alert">' + esc(dbError(r.error)) + '</p>'; return; }
            if (!r.data.length) { list.innerHTML = empty('📋', p.role === 'tecnico' ? 'Todavía no registraste mantenimientos.' : 'Todavía no hay registros.'); return; }
            withAuthors(r.data).then(function (rows) {
                list.innerHTML = '';
                rows.forEach(function (rec) { list.appendChild(recordCard(rec)); });
            });
        });
    }

    function stat(cls, n, label) {
        return '<div class="adm-stat ' + cls + '"><strong>' + n + '</strong><span>' + esc(label) + '</span></div>';
    }

    function pickTagToRegister() {
        var body = el('<div><input type="search" class="adm-input" placeholder="Buscar TAG o servicio" aria-label="Buscar equipo"><div class="adm-pick"></div></div>');
        var input = body.querySelector('input');
        var list = body.querySelector('.adm-pick');
        function draw() {
            var q = L.fold(input.value);
            var hits = TAGS.filter(function (t) { return !q || L.fold(t.tag + ' ' + t.servicio).indexOf(q) !== -1; }).slice(0, 30);
            list.innerHTML = hits.map(function (t) {
                return '<a class="adm-pick-item" href="' + esc(fichaUrl(t.tag)) + '#historial-view"><strong>' + esc(t.tag) + '</strong><span>' + esc(t.servicio) + '</span></a>';
            }).join('') || empty('🔎', 'No hay equipos con ese nombre.');
        }
        input.addEventListener('input', draw);
        draw();
        sheet({ title: '¿En qué equipo?', body: body });
    }

    // ── 📋 Registros ──────────────────────────────────────────────────────
    function recordsQuery() {
        return client.from('maintenance_records')
            .select('id,tag_id,performed_at,created_at,type,description,parts_used,hmi_hours,created_by,' +
                'maintenance_record_activities(activity_id,maintenance_activities(name)),maintenance_attachments(count)')
            .order('performed_at', { ascending: false })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false });
    }

    function withAuthors(rows) {
        var ids = rows.map(function (r) { return r.created_by; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        if (!ids.length) return Promise.resolve(rows);
        return client.from('author_names').select('user_id,full_name').in('user_id', ids).then(function (r) {
            var names = {};
            (r.data || []).forEach(function (a) { names[a.user_id] = a.full_name; });
            rows.forEach(function (x) { x.author = names[x.created_by] || 'Usuario'; });
            return rows;
        });
    }

    function recordCard(rec) {
        var acts = (rec.maintenance_record_activities || []).map(function (a) {
            return a.maintenance_activities ? a.maintenance_activities.name : '';
        }).filter(Boolean);
        var media = rec.maintenance_attachments && rec.maintenance_attachments[0] ? rec.maintenance_attachments[0].count : 0;
        var card = el('<button type="button" class="adm-card adm-rec">' +
            '<span class="adm-rec-top"><strong>' + esc(rec.tag_id) +
            (rec.type === 'correctivo' ? ' <span class="adm-chip is-warn">Correctivo</span>' : '') +
            '</strong><span>' + esc(L.formatDate(rec.performed_at)) + '</span></span>' +
            '<span class="adm-rec-desc">' + esc(rec.description) + '</span>' +
            '<span class="adm-rec-meta">' + esc(rec.author || '') + (acts.length ? ' · ' + acts.length + ' rutina' + (acts.length > 1 ? 's' : '') : '') +
            (media ? ' · 📷 ' + media : '') + '</span></button>');
        card.addEventListener('click', function () { openRecord(rec, acts, card); });
        return card;
    }

    function openRecord(rec, acts, card) {
        var isOficina = state.profile.role === 'oficina';
        var body = el('<div class="adm-detail">' +
            '<p class="adm-muted">' + esc(tagInfo(rec.tag_id).servicio) + '</p>' +
            '<dl><dt>Fecha</dt><dd>' + esc(L.formatDate(rec.performed_at)) + '</dd>' +
            '<dt>Tipo</dt><dd>' + (rec.type === 'correctivo' ? 'Correctivo' : 'Preventivo') + '</dd>' +
            '<dt>Autor</dt><dd>' + esc(rec.author || '') + '</dd>' +
            (rec.hmi_hours != null ? '<dt>Horas HMI</dt><dd>' + esc(rec.hmi_hours) + '</dd>' : '') +
            '</dl><p class="adm-pre"></p>' +
            (rec.parts_used ? '<h3 class="adm-h3">Repuestos / insumos</h3><p class="adm-pre adm-parts"></p>' : '') +
            (acts.length ? '<h3 class="adm-h3">Rutinas</h3><ul class="adm-list">' + acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
            '<a class="adm-btn is-ghost is-block" href="' + esc(fichaUrl(rec.tag_id)) + '">Ver ficha y fotos</a></div>');
        body.querySelector('.adm-pre').textContent = rec.description;
        if (rec.parts_used) body.querySelector('.adm-parts').textContent = rec.parts_used;
        var actions = [];
        var s;
        if (isOficina) {
            actions.push(button('Borrar', 'is-danger', function () {
                confirmSheet('Borrar registro', 'Borrar el registro del ' + L.formatDate(rec.performed_at) + ' de ' + rec.tag_id +
                    '. Las fotos se conservan como evidencia.', 'Borrar', true).then(function (ok) {
                    if (!ok) return;
                    client.from('maintenance_records').delete().eq('id', rec.id).then(function (r) {
                        if (r.error) return toast(dbError(r.error), 'error');
                        s.close();
                        card.remove();
                        toast('Registro borrado.');
                    });
                });
            }));
            actions.push(button('Editar', 'is-primary', function () { s.close(); editRecord(rec); }));
        }
        s = sheet({ title: rec.tag_id + ' · ' + L.formatDate(rec.performed_at), body: body, actions: actions, focus: false });
    }

    // Rutinas que se pueden marcar en un registro: las activas del tipo del TAG
    // más las que ya tenía marcadas (aunque hoy estén desactivadas).
    function activitiesForTag(tag, currentIds) {
        return client.from('equipment_tags').select('class_id').eq('tag_id', tag).maybeSingle().then(function (r) {
            var classId = r.data && r.data.class_id;
            if (!classId) return [];
            return client.from('maintenance_activities').select('id,name,active,interval_weeks')
                .eq('class_id', classId).order('name').then(function (a) {
                    return (a.data || []).filter(function (x) { return x.active || currentIds.indexOf(x.id) !== -1; });
                });
        });
    }

    function editRecord(rec) {
        var current = (rec.maintenance_record_activities || []).map(function (a) { return a.activity_id; });
        var form = el('<form class="adm-form" novalidate>' +
            '<label class="adm-field"><span>Fecha</span><input type="date" name="fecha" required></label>' +
            '<label class="adm-field"><span>Tipo</span><select name="tipo"><option value="preventivo">Preventivo</option><option value="correctivo">Correctivo</option></select></label>' +
            '<label class="adm-field"><span>Descripción</span><textarea name="desc" rows="4" required></textarea></label>' +
            '<fieldset class="adm-field"><span>Rutinas realizadas</span><div class="adm-acts">' + skeleton(1) + '</div></fieldset>' +
            '<label class="adm-field"><span>Repuestos / insumos (opcional)</span><textarea name="parts" rows="2"></textarea></label>' +
            '<label class="adm-field"><span>Horas HMI (opcional)</span><input type="number" name="hmi" min="0" step="0.1" inputmode="decimal"></label>' +
            '<p class="adm-error" hidden></p></form>');
        form.fecha.value = rec.performed_at;
        form.tipo.value = rec.type || 'preventivo';
        form.desc.value = rec.description;
        form.parts.value = rec.parts_used || '';
        if (rec.hmi_hours != null) form.hmi.value = rec.hmi_hours;
        var actsBox = form.querySelector('.adm-acts');
        activitiesForTag(rec.tag_id, current).then(function (acts) {
            if (!acts.length) { actsBox.innerHTML = '<p class="adm-muted">Este equipo no tiene tipo asignado (⚙️ Equipos).</p>'; return; }
            actsBox.innerHTML = acts.map(function (a) {
                return '<label class="adm-check adm-act-check"><input type="checkbox" name="act" value="' + a.id + '"' +
                    (current.indexOf(a.id) !== -1 ? ' checked' : '') + '> <span>' + esc(a.name) + ' <small>' + esc(freqLabel(a.interval_weeks)) + '</small></span></label>';
            }).join('');
        });
        var save = button('Guardar', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            if (!form.fecha.value || !form.desc.value.trim()) { err.textContent = 'La fecha y la descripción son obligatorias.'; err.hidden = false; return; }
            var chosen = Array.prototype.filter.call(form.querySelectorAll('[name=act]'), function (c) { return c.checked; })
                .map(function (c) { return c.value; });
            var toAdd = chosen.filter(function (id) { return current.indexOf(id) === -1; });
            var toDel = current.filter(function (id) { return chosen.indexOf(id) === -1 && form.querySelector('[name=act][value="' + id + '"]'); });
            busy(save, true);
            client.from('maintenance_records').update({
                performed_at: form.fecha.value, type: form.tipo.value, description: form.desc.value.trim(),
                parts_used: form.parts.value.trim() || null,
                hmi_hours: form.hmi.value === '' ? null : Number(form.hmi.value),
            }).eq('id', rec.id).then(function (r) {
                if (r.error) throw r.error;
                var ops = [];
                if (toAdd.length) ops.push(client.from('maintenance_record_activities').insert(toAdd.map(function (id) { return { record_id: rec.id, activity_id: id }; })));
                if (toDel.length) ops.push(client.from('maintenance_record_activities').delete().eq('record_id', rec.id).in('activity_id', toDel));
                return Promise.all(ops);
            }).then(function (res) {
                var bad = (res || []).filter(function (x) { return x.error; })[0];
                if (bad) throw bad.error;
                busy(save, false);
                s.close();
                toast('Registro actualizado.');
                route();
            }).catch(function (e) {
                busy(save, false);
                err.textContent = dbError(e);
                err.hidden = false;
            });
        });
        var s = sheet({ title: 'Editar · ' + rec.tag_id, body: form, actions: [button('Cancelar', 'is-ghost', function () { s.close(); }), save] });
    }

    function screenRegistros(box) {
        var mine = state.profile.role === 'tecnico';
        box.innerHTML = '<h1 class="adm-h1">' + (mine ? 'Mis registros' : 'Registros') + '</h1>' +
            '<div class="adm-searchbar"><input type="search" class="adm-input" id="reg-q" placeholder="Filtrar por TAG (ej. 400-MX)" aria-label="Filtrar por TAG" autocapitalize="characters"></div>' +
            '<div id="reg-list"></div><button type="button" class="adm-btn is-ghost is-block" id="reg-more" hidden>Cargar más</button>';
        var list = box.querySelector('#reg-list');
        var more = box.querySelector('#reg-more');
        var input = box.querySelector('#reg-q');
        var last = null;
        var token = 0;

        function matchingTags() {
            var q = L.fold(input.value);
            if (!q) return null;
            return TAGS.filter(function (t) { return L.fold(t.tag + ' ' + t.servicio).indexOf(q) !== -1; }).map(function (t) { return t.tag; });
        }

        function load(reset) {
            var my = ++token;
            if (reset) { last = null; list.innerHTML = skeleton(4); }
            var q = recordsQuery().limit(PAGE + 1);
            if (mine) q = q.eq('created_by', state.session.user.id);
            var tags = matchingTags();
            if (tags) {
                if (!tags.length) { list.innerHTML = empty('🔎', 'Ningún equipo coincide con "' + input.value + '".'); more.hidden = true; return; }
                q = q.in('tag_id', tags);
            }
            if (last) {
                q = q.or('performed_at.lt.' + last.performed_at +
                    ',and(performed_at.eq.' + last.performed_at + ',created_at.lt.' + last.created_at + ')' +
                    ',and(performed_at.eq.' + last.performed_at + ',created_at.eq.' + last.created_at + ',id.lt.' + last.id + ')');
            }
            q.then(function (r) {
                if (my !== token) return;
                if (r.error) { list.innerHTML = '<p class="adm-alert">' + esc(dbError(r.error)) + '</p>'; return; }
                var rows = r.data.slice(0, PAGE);
                more.hidden = r.data.length <= PAGE;
                if (reset) list.innerHTML = '';
                if (!rows.length && reset) {
                    list.innerHTML = empty('📋', mine ? 'Todavía no registraste mantenimientos.' : 'No hay registros con ese filtro.');
                    return;
                }
                withAuthors(rows).then(function (rows2) {
                    if (my !== token) return;
                    var lastMonth = list.dataset.month || '';
                    rows2.forEach(function (rec) {
                        var month = L.formatDate(rec.performed_at).split(' ').slice(1).join(' ');
                        if (month !== lastMonth) { list.appendChild(el('<h2 class="adm-month">' + esc(month) + '</h2>')); lastMonth = month; }
                        list.appendChild(recordCard(rec));
                    });
                    list.dataset.month = lastMonth;
                    last = rows2[rows2.length - 1];
                });
            });
        }
        var t;
        input.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { list.dataset.month = ''; load(true); }, 250); });
        more.addEventListener('click', function () { load(false); });
        load(true);
    }

    // ── 🔧 Rutinas ────────────────────────────────────────────────────────
    function loadCatalog() {
        return Promise.all([
            client.from('equipment_classes').select('id,code,name,hours_per_day').order('name'),
            client.from('maintenance_activities').select('id,class_id,code,name,interval_weeks,interval_hours,active').order('name'),
            client.from('equipment_tags').select('tag_id,class_id,group_key,regime'),
            client.from('tag_resources').select('*'),
        ]).then(function (r) {
            var err = r[0].error || r[1].error || r[2].error;
            if (err) throw err;
            var res = {};
            (r[3].data || []).forEach(function (x) { res[x.tag_id] = x; });
            return { classes: r[0].data, acts: r[1].data, tags: r[2].data, resources: res };
        });
    }

    function screenRutinas(box) {
        box.innerHTML = '<h1 class="adm-h1">Rutinas</h1><p class="adm-muted">Por tipo de equipo · máximo 5 activas.</p><div id="cls">' + skeleton(4) + '</div>' +
            '<button type="button" class="adm-fab" id="cls-new" aria-label="Nuevo tipo de equipo">＋ Tipo de equipo</button>';
        box.querySelector('#cls-new').addEventListener('click', newClass);
        loadCatalog().then(function (cat) {
            box.querySelector('.adm-muted').insertAdjacentElement('afterend', button('📥 Importar rutinas base', 'is-ghost is-block', function () { importSabana(cat); }));
            var list = box.querySelector('#cls');
            list.innerHTML = '';
            if (!cat.classes.length) { list.innerHTML = empty('🔧', 'Todavía no hay tipos de equipo.'); return; }
            cat.classes.forEach(function (c) {
                var acts = cat.acts.filter(function (a) { return a.class_id === c.id; });
                var active = acts.filter(function (a) { return a.active; });
                var tags = cat.tags.filter(function (t) { return t.class_id === c.id; }).map(function (t) { return t.tag_id; }).sort();
                var item = el('<details class="adm-card adm-cls"><summary><span><strong></strong><small></small></span><span class="adm-badge"></span></summary><div class="adm-cls-body"></div></details>');
                item.querySelector('strong').textContent = c.name;
                item.querySelector('small').textContent = tags.length ? tags.join(' · ') : 'Sin equipos asignados';
                item.querySelector('.adm-badge').textContent = active.length + '/5';
                var bodyEl = item.querySelector('.adm-cls-body');
                acts.sort(function (a, b) { return (b.active - a.active) || ((a.interval_weeks || 0) - (b.interval_weeks || 0)); }).forEach(function (a) {
                    var row = el('<div class="adm-act' + (a.active ? '' : ' is-off') + '"><button type="button" class="adm-act-main"><span class="adm-act-name"></span><span class="adm-chip"></span></button>' +
                        '<label class="adm-switch" title="Activa"><input type="checkbox" aria-label="Activa"><span></span></label></div>');
                    row.querySelector('.adm-act-name').textContent = a.name;
                    row.querySelector('.adm-chip').textContent = freqLabel(a.interval_weeks, a.interval_hours);
                    var sw = row.querySelector('input');
                    sw.checked = a.active;
                    sw.addEventListener('change', function () {
                        if (sw.checked && active.length >= 5) { sw.checked = false; toast('Máximo 5 rutinas activas. Desactivá otra primero.', 'error'); return; }
                        var go = sw.checked ? Promise.resolve(true) : confirmSheet('Desactivar rutina', '"' + a.name + '" deja de aparecer al registrar. Los registros anteriores se conservan.', 'Desactivar', true);
                        go.then(function (ok) {
                            if (!ok) { sw.checked = true; return; }
                            client.from('maintenance_activities').update({ active: sw.checked }).eq('id', a.id).then(function (r) {
                                if (r.error) { sw.checked = !sw.checked; return toast(dbError(r.error), 'error'); }
                                toast(sw.checked ? 'Rutina activada.' : 'Rutina desactivada.');
                                route();
                            });
                        });
                    });
                    row.querySelector('.adm-act-main').addEventListener('click', function () { editActivity(c, a, acts); });
                    bodyEl.appendChild(row);
                });
                bodyEl.insertBefore(el('<p class="adm-muted adm-cls-hpd">Uso estimado: ' + esc(c.hours_per_day) + ' h/día</p>'), bodyEl.firstChild);
                var add = button('＋ Rutina', 'is-ghost is-block', function () { editActivity(c, null, acts); });
                if (active.length >= 5) { add.disabled = true; add.textContent = 'Máximo 5 rutinas activas'; }
                bodyEl.appendChild(add);
                bodyEl.appendChild(button('Editar tipo de equipo', 'is-ghost is-block', function () { editClass(c); }));
                list.appendChild(item);
            });
        }).catch(function (e) { box.querySelector('#cls').innerHTML = '<p class="adm-alert">' + esc(dbError(e)) + '</p>'; });
    }

    function freqField(weeks) {
        var known = FREQS.some(function (f) { return f.weeks === weeks; });
        return '<label class="adm-field"><span>Frecuencia</span><select name="freq">' +
            FREQS.map(function (f) { return '<option value="' + f.weeks + '"' + (f.weeks === weeks ? ' selected' : '') + '>' + f.label + '</option>'; }).join('') +
            '<option value="otra"' + (!known && weeks ? ' selected' : '') + '>Otra…</option></select></label>' +
            '<label class="adm-field" data-otra' + (!known && weeks ? '' : ' hidden') + '><span>Cada cuántas semanas</span><input type="number" name="weeks" min="1" max="520" inputmode="numeric" value="' + (weeks || '') + '"></label>';
    }

    function editActivity(cls, act, acts) {
        var form = el('<form class="adm-form" novalidate>' +
            '<label class="adm-field"><span>Nombre de la rutina</span><textarea name="name" rows="2" maxlength="140" required></textarea></label>' +
            freqField(act ? act.interval_weeks : 4) +
            '<label class="adm-field"><span>…o cada cuántas horas de trabajo (opcional)</span><input type="number" name="hours" min="1" step="1" inputmode="numeric" placeholder="Ej. 8000"></label>' +
            '<p class="adm-note">Si ponés horas, gana lo que llegue primero: la fecha o las horas del HMI.</p>' +
            '<p class="adm-error" hidden></p></form>');
        if (act && act.interval_hours) form.hours.value = act.interval_hours;
        form.name.value = act ? act.name : '';
        form.freq.addEventListener('change', function () { form.querySelector('[data-otra]').hidden = form.freq.value !== 'otra'; });
        var save = button(act ? 'Guardar' : 'Agregar rutina', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            var name = form.name.value.trim();
            var weeks = form.freq.value === 'otra' ? parseInt(form.weeks.value, 10) : parseInt(form.freq.value, 10);
            if (!name) { err.textContent = 'Escribí el nombre de la rutina.'; err.hidden = false; return; }
            if (!weeks || weeks < 1) { err.textContent = 'Indicá cada cuántas semanas.'; err.hidden = false; return; }
            var hours = form.hours.value === '' ? null : parseInt(form.hours.value, 10);
            if (hours !== null && !(hours > 0)) { err.textContent = 'Las horas deben ser un número mayor que 0.'; err.hidden = false; return; }
            busy(save, true);
            var req;
            if (act) {
                req = client.from('maintenance_activities').update({ name: name, interval_weeks: weeks, interval_hours: hours }).eq('id', act.id);
            } else {
                var code = slug(name);
                var used = acts.map(function (a) { return a.code; });
                var n = 2;
                var base = code;
                while (used.indexOf(code) !== -1) code = base.slice(0, 21) + '-' + n++;
                req = client.from('maintenance_activities').insert({ class_id: cls.id, code: code, name: name, interval_weeks: weeks, interval_hours: hours });
            }
            req.then(function (r) {
                busy(save, false);
                if (r.error) { err.textContent = dbError(r.error); err.hidden = false; return; }
                s.close();
                toast(act ? 'Rutina guardada.' : 'Rutina agregada.');
                route();
            });
        });
        var s = sheet({ title: (act ? 'Editar rutina · ' : 'Nueva rutina · ') + cls.name, body: form, actions: [button('Cancelar', 'is-ghost', function () { s.close(); }), save] });
    }

    function editClass(c) {
        var form = el('<form class="adm-form" novalidate>' +
            '<label class="adm-field"><span>Nombre</span><input name="name" maxlength="60" required></label>' +
            '<label class="adm-field"><span>Horas de trabajo por día (estimado)</span><input type="number" name="hpd" min="0.5" max="24" step="0.5" inputmode="decimal" required></label>' +
            '<p class="adm-note">Se usa para estimar cuándo toca una rutina por horas si no hay lecturas del HMI.</p><p class="adm-error" hidden></p></form>');
        form.name.value = c.name;
        form.hpd.value = c.hours_per_day;
        var save = button('Guardar', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            var hpd = Number(form.hpd.value);
            if (!form.name.value.trim()) { err.textContent = 'Escribí el nombre.'; err.hidden = false; return; }
            if (!(hpd > 0 && hpd <= 24)) { err.textContent = 'Las horas por día deben estar entre 0,5 y 24.'; err.hidden = false; return; }
            busy(save, true);
            client.from('equipment_classes').update({ name: form.name.value.trim(), hours_per_day: hpd }).eq('id', c.id).then(function (r) {
                busy(save, false);
                if (r.error) { err.textContent = dbError(r.error); err.hidden = false; return; }
                s.close();
                toast('Tipo de equipo guardado.');
                route();
            });
        });
        var s = sheet({ title: 'Editar · ' + c.name, body: form, actions: [button('Cancelar', 'is-ghost', function () { s.close(); }), save] });
    }

    function newClass() {
        var form = el('<form class="adm-form" novalidate><label class="adm-field"><span>Nombre del tipo de equipo</span><input name="name" maxlength="60" placeholder="Ej. Agitador sumergible" required></label><p class="adm-error" hidden></p></form>');
        var save = button('Crear', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            var name = form.name.value.trim();
            if (!name) { err.textContent = 'Escribí el nombre.'; err.hidden = false; return; }
            busy(save, true);
            client.from('equipment_classes').insert({ code: slug(name), name: name, hours_per_day: 24 }).then(function (r) {
                busy(save, false);
                if (r.error) { err.textContent = /duplicate/i.test(r.error.message) ? 'Ya existe un tipo con ese nombre.' : dbError(r.error); err.hidden = false; return; }
                s.close();
                toast('Tipo de equipo creado. Agregale sus rutinas.');
                route();
            });
        });
        var s = sheet({ title: 'Nuevo tipo de equipo', body: form, actions: [button('Cancelar', 'is-ghost', function () { s.close(); }), save] });
    }

    // ── ⚙️ Equipos ────────────────────────────────────────────────────────
    function pairOf(tag) {
        var m = /^(.*\d)([AB])$/.exec(tag);
        if (!m) return null;
        var other = m[1] + (m[2] === 'A' ? 'B' : 'A');
        return TAGS.some(function (t) { return t.tag === other; }) ? other : null;
    }

    function screenEquipos(box) {
        box.innerHTML = '<h1 class="adm-h1">Equipos</h1><p class="adm-muted">Tipo de equipo de cada TAG (define sus rutinas).</p>' +
            '<div class="adm-searchbar"><input type="search" class="adm-input" id="eq-q" placeholder="Buscar TAG o servicio" aria-label="Buscar equipo"></div>' +
            '<div id="eq-list">' + skeleton(5) + '</div>';
        loadCatalog().then(function (cat) {
            var byTag = {};
            cat.tags.forEach(function (t) { byTag[t.tag_id] = t; });
            var classes = {};
            cat.classes.forEach(function (c) { classes[c.id] = c; });
            var list = box.querySelector('#eq-list');
            var input = box.querySelector('#eq-q');
            function draw() {
                var q = L.fold(input.value);
                var rows = TAGS.filter(function (t) { return !q || L.fold(t.tag + ' ' + t.servicio).indexOf(q) !== -1; });
                var missing = TAGS.filter(function (t) { return !byTag[t.tag] || !byTag[t.tag].class_id; }).length;
                list.innerHTML = '';
                if (missing) {
                    list.appendChild(el('<p class="adm-alert">' + missing + ' equipo(s) sin tipo asignado.</p>'));
                    list.appendChild(button('🪄 Auto-asignar', 'is-ghost is-block', function () { autoAssign(cat, byTag); }));
                }
                if (!rows.length) { list.innerHTML += empty('🔎', 'Ningún equipo coincide.'); return; }
                rows.forEach(function (t) {
                    var cur = byTag[t.tag] && classes[byTag[t.tag].class_id];
                    var pair = pairOf(t.tag);
                    var card = el('<button type="button" class="adm-card adm-eq"><span class="adm-rec-top"><strong></strong><span class="adm-chip"></span></span>' +
                        '<span class="adm-rec-desc"></span>' + (pair ? '<span class="adm-rec-meta">Par con ' + esc(pair) + ' · cada uno con su historial</span>' : '') + '</button>');
                    card.querySelector('strong').textContent = t.tag;
                    card.querySelector('.adm-chip').textContent = cur ? cur.name : 'Sin tipo';
                    if (pair && byTag[t.tag] && REGIMES[byTag[t.tag].regime] && byTag[t.tag].regime !== 'normal') {
                        card.querySelector('.adm-rec-desc').insertAdjacentHTML('afterend', '<span class="adm-rec-meta">' + esc(REGIMES[byTag[t.tag].regime]) + '</span>');
                    }
                    if (!cur) card.querySelector('.adm-chip').classList.add('is-warn');
                    card.querySelector('.adm-rec-desc').textContent = t.servicio;
                    card.addEventListener('click', function () { assignClass(t, cur, cat.classes, pair, byTag[t.tag], cat.resources[t.tag]); });
                    list.appendChild(card);
                });
            }
            input.addEventListener('input', draw);
            draw();
        }).catch(function (e) { box.querySelector('#eq-list').innerHTML = '<p class="adm-alert">' + esc(dbError(e)) + '</p>'; });
    }

    function assignClass(t, cur, classes, pair, row, links) {
        var form = el('<form class="adm-form" novalidate><p class="adm-muted"></p><label class="adm-field"><span>Tipo de equipo</span><select name="cls"><option value="">— Elegí —</option>' +
            classes.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
            (pair ? '<label class="adm-field"><span>Papel dentro del par con ' + esc(pair) + '</span><select name="reg">' +
                Object.keys(REGIMES).map(function (k) { return '<option value="' + k + '">' + esc(REGIMES[k]) + '</option>'; }).join('') +
                '</select></label>' : '') +
            '<h3 class="adm-h3">Enlaces de documentos</h3>' +
            '<label class="adm-field"><span>Especificaciones</span><input type="url" name="l_spec" inputmode="url" placeholder="https://…"></label>' +
            '<label class="adm-field"><span>Manual</span><input type="url" name="l_man" inputmode="url" placeholder="https://…"></label>' +
            '<label class="adm-field"><span>Mantenimiento</span><input type="url" name="l_mto" inputmode="url" placeholder="https://…"></label>' +
            '<p class="adm-muted">Los botones aparecen en la ficha en unos 15 minutos.</p>' +
            (cur ? '<p class="adm-note">Las rutinas de los registros anteriores se conservan; las fechas se calculan con las rutinas del tipo nuevo.</p>' : '') +
            '<p class="adm-error" hidden></p></form>');
        form.querySelector('.adm-muted').textContent = t.servicio;
        form.appendChild(photosBlock(t.tag));
        if (cur) form.cls.value = cur.id;
        if (pair) form.reg.value = (row && row.regime) || 'normal';
        links = links || {};
        form.l_spec.value = links.specifications || '';
        form.l_man.value = links.handbook || '';
        form.l_mto.value = links.maintenance || '';
        var save = button('Guardar', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            if (!form.cls.value) { err.textContent = 'Elegí un tipo de equipo.'; err.hidden = false; return; }
            var urls = { specifications: form.l_spec.value.trim() || null, handbook: form.l_man.value.trim() || null, maintenance: form.l_mto.value.trim() || null };
            var badUrl = Object.keys(urls).filter(function (k) { return urls[k] && !/^https?:\/\//i.test(urls[k]); })[0];
            if (badUrl) { err.textContent = 'Los enlaces deben empezar con https://'; err.hidden = false; return; }
            var linksChanged = ['specifications', 'handbook', 'maintenance'].some(function (k) { return (links[k] || null) !== urls[k]; });
            busy(save, true);
            var group = pair ? t.tag.replace(/[AB]$/, '') : null;
            client.from('equipment_tags').upsert({ tag_id: t.tag, class_id: form.cls.value, group_key: group, regime: pair ? form.reg.value : 'normal' }).then(function (r) {
                if (r.error || !linksChanged) return r;
                return client.from('tag_resources').upsert(Object.assign({ tag_id: t.tag }, urls));
            }).then(function (r) {
                busy(save, false);
                if (r.error) { err.textContent = dbError(r.error); err.hidden = false; return; }
                s.close();
                toast('Tipo asignado a ' + t.tag + '.');
                route();
            });
        });
        var s = sheet({ title: t.tag, body: form, actions: [button('Cancelar', 'is-ghost', function () { s.close(); }), save] });
    }

    // ── ☰ Más ────────────────────────────────────────────────────────────
    function screenMas(box) {
        box.innerHTML = '<h1 class="adm-h1">Más</h1><div class="adm-menu">' +
            '<a class="adm-card adm-menu-item" href="#usuarios"><span>👥</span><strong>Usuarios</strong><em>›</em></a>' +
            '<a class="adm-card adm-menu-item" href="#sitio"><span>🌐</span><strong>Sitio: títulos, color, logo y fichas</strong><em>›</em></a>' +
            '<a class="adm-card adm-menu-item" href="#qr"><span>📱</span><strong>Códigos QR para imprimir</strong><em>›</em></a>' +
            '<a class="adm-card adm-menu-item" href="#cuenta"><span>🔑</span><strong>Mi cuenta</strong><em>›</em></a>' +
            '<a class="adm-card adm-menu-item" href="../mantenimientos.html"><span>🛠</span><strong>Ver el sitio de mantenimientos</strong><em>›</em></a>' +
            '</div><h2 class="adm-h2">Descargar (Excel)</h2><div class="adm-menu">' +
            '<button type="button" class="adm-card adm-menu-item" id="dl-rutinas"><span>🔧</span><strong>Rutinas por tipo de equipo</strong><em>⬇</em></button>' +
            '<button type="button" class="adm-card adm-menu-item" id="dl-equipos"><span>⚙️</span><strong>Equipos y su tipo</strong><em>⬇</em></button>' +
            '<button type="button" class="adm-card adm-menu-item" id="dl-registros"><span>📋</span><strong>Registros (últimos 12 meses)</strong><em>⬇</em></button>' +
            '</div>';
        box.querySelector('#dl-rutinas').addEventListener('click', function () { exportRutinas(this); });
        box.querySelector('#dl-equipos').addEventListener('click', function () { exportEquipos(this); });
        box.querySelector('#dl-registros').addEventListener('click', function () { exportRegistros(this); });
    }

    // ── 🌐 Sitio (títulos, color, logo, Excel de fichas) ─────────────────
    function publishStatus(box, settings) {
        var st = box.querySelector('#site-status');
        var same = function (a, b) { return a && b && Date.parse(a) === Date.parse(b); };
        Promise.all([
            fetch('../publish_status.json?t=' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
            fetch('../migration_metadata.json?t=' + Date.now()).then(function (r) { return r.json(); }).catch(function () { return {}; }),
        ]).then(function (res) {
            var ps = res[0], meta = res[1];
            st.innerHTML = '';
            if (ps && same(ps.version, settings.version) && !ps.ok) {
                st.className = 'adm-status is-bad';
                st.appendChild(el('<span>❌ No se pudo publicar el último cambio.</span>'));
                st.appendChild(el('<p class="adm-status-err"></p>')).textContent = ps.error || '';
            } else if (same(meta.source_version, settings.version)) {
                st.className = 'adm-status is-ok';
                st.appendChild(el('<span>✅ Publicado' + (meta.total_tags ? ' · ' + meta.total_tags + ' TAG' : '') + '</span>'));
            } else {
                st.className = 'adm-status is-wait';
                st.appendChild(el('<span>⏳ En cola: se publica en unos 15 minutos (máx. 20).</span>'));
            }
            if (ps && ps.at) {
                var det = el('<details class="adm-status-det"><summary>Resultado de la última publicación</summary><ul></ul><pre></pre></details>');
                var ul = det.querySelector('ul');
                ul.appendChild(el('<li></li>')).textContent = (ps.ok ? 'Correcta' : 'Con error') + ' · ' + L.formatDate(ps.at) + ' ' + String(ps.at).slice(11, 16) + ' UTC' + (ps.tags ? ' · ' + ps.tags + ' TAG' : '');
                (ps.warnings || []).forEach(function (w) { ul.appendChild(el('<li></li>')).textContent = w; });
                det.querySelector('pre').textContent = (ps.log || []).join('\n');
                st.appendChild(det);
            }
        });
    }

    function screenSitio(box) {
        box.innerHTML = '<a class="adm-back" href="#mas">‹ Más</a><h1 class="adm-h1">Sitio</h1>' +
            '<p class="adm-status" id="site-status"></p><div id="site-body">' + skeleton(3) + '</div>';
        client.from('site_settings').select('*').eq('id', 1).maybeSingle().then(function (r) {
            var body = box.querySelector('#site-body');
            if (r.error || !r.data) { body.innerHTML = '<p class="adm-alert">' + esc(r.error ? dbError(r.error) : 'Falta la configuración inicial del sitio.') + '</p>'; return; }
            var st = r.data;
            publishStatus(box, st);
            body.innerHTML = '';
            var form = el('<form class="adm-form adm-card" novalidate><h2 class="adm-h2">Textos y color</h2>' +
                '<label class="adm-field"><span>Título del sitio</span><input name="t1" maxlength="80"></label>' +
                '<label class="adm-field"><span>Título del banner (largo)</span><input name="t2" maxlength="100"></label>' +
                '<label class="adm-field"><span>Título del banner (corto, celular)</span><input name="t3" maxlength="30"></label>' +
                '<label class="adm-field"><span>Enlace del logo del cliente</span><input type="url" name="href" inputmode="url" placeholder="https://…"></label>' +
                '<label class="adm-field"><span>Color principal</span><span class="adm-color"><input type="color" name="color"><span class="adm-color-prev">Así se ve el banner</span></span></label>' +
                '<p class="adm-error" hidden></p><button type="submit" class="adm-btn is-primary is-block">Guardar y publicar</button></form>');
            form.t1.value = st.site_title; form.t2.value = st.banner_title_full; form.t3.value = st.banner_title_short;
            form.href.value = st.logo_href || '';
            form.color.value = st.accent || '#081c49';
            var prev = form.querySelector('.adm-color-prev');
            function paint() { prev.style.background = form.color.value; prev.style.color = parseInt(form.color.value.slice(1), 16) > 0x999999 ? '#1f2328' : '#fff'; }
            form.color.addEventListener('input', paint); paint();
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var err = form.querySelector('.adm-error');
                if (!form.t1.value.trim() || !form.t2.value.trim() || !form.t3.value.trim()) { err.textContent = 'Los tres títulos son obligatorios.'; err.hidden = false; return; }
                if (form.href.value && !/^https?:\/\//i.test(form.href.value.trim())) { err.textContent = 'El enlace debe empezar con https://'; err.hidden = false; return; }
                var btn = form.querySelector('[type=submit]');
                busy(btn, true);
                client.from('site_settings').update({
                    site_title: form.t1.value.trim(), banner_title_full: form.t2.value.trim(), banner_title_short: form.t3.value.trim(),
                    logo_href: form.href.value.trim() || null, accent: form.color.value,
                }).eq('id', 1).select().single().then(function (u) {
                    busy(btn, false);
                    if (u.error) { err.textContent = dbError(u.error); err.hidden = false; return; }
                    err.hidden = true;
                    toast('Guardado. Se publica en unos 15 minutos.');
                    publishStatus(box, u.data);
                });
            });
            body.appendChild(form);
            body.appendChild(uploadCard('Logo del cliente', 'Imagen PNG o JPG, idealmente con fondo transparente y texto claro (va sobre el banner).',
                'image/png,image/jpeg,image/webp,image/svg+xml', 'logo', st, box));
            body.appendChild(uploadCard('Logo para los QR', 'El logo del cliente a color sobre fondo blanco (va en el centro de cada QR). PNG o JPG.',
                'image/png,image/jpeg,image/webp', 'qr_logo', st, box));
            body.appendChild(uploadCard('Excel de fichas técnicas', 'El mismo Excel de donde salen los PDF (.xlsx o .xlsm). Reemplaza el contenido de todas las fichas.',
                '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12', 'fichas', st, box));
            body.appendChild(uploadCard('Enlaces de documentos (todos los TAG)', 'Excel TAG_RESOURCES.xlsx con columnas TAG_ID, Specifications, Handbook_Manual y Maintenance. Los enlaces editados uno por uno en ⚙️ Equipos tienen prioridad.',
                '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'resources', st, box));
            var regen = el('<div class="adm-card"><h2 class="adm-h2">Regenerar todo el sitio</h2>' +
                '<p class="adm-muted">Vuelve a armar las fichas de todos los TAG con lo último guardado (Excel, enlaces, logo y textos). Usalo si algo se ve desactualizado.</p></div>');
            regen.appendChild(button('🔄 Regenerar el sitio ahora', 'is-ghost is-block', function () {
                var btn = this;
                busy(btn, true, 'Enviando…');
                client.from('site_settings').update({ site_title: st.site_title }).eq('id', 1).select().single().then(function (u) {
                    busy(btn, false);
                    if (u.error) return toast(dbError(u.error), 'error');
                    toast('Listo. El sitio se regenera en unos 15 minutos.');
                    publishStatus(box, u.data);
                });
            }));
            body.appendChild(regen);
        });
    }

    function previewFichas(file) {
        return loadLib(JSZIP_URL).then(function () { return window.JSZip.loadAsync(file); }).then(function (zip) {
            var wb = zip.file('xl/workbook.xml');
            if (!wb) throw new Error('No es un Excel válido (.xlsx o .xlsm).');
            return wb.async('string');
        }).then(function (xml) {
            var names = [];
            xml.replace(/<sheet\b[^>]*\bname="([^"]+)"/g, function (_, n) { names.push(n.replace(/&amp;/g, '&')); });
            var r = L.previewSheets(names, TAGS.map(function (t) { return t.tag; }));
            var counts = r.removed.length
                ? client.from('maintenance_records').select('tag_id').in('tag_id', r.removed).then(function (q) {
                    var c = {}; (q.data || []).forEach(function (x) { c[x.tag_id] = (c[x.tag_id] || 0) + 1; }); return c; })
                : Promise.resolve({});
            return counts.then(function (withRecords) {
                var body = el('<div class="adm-preview"></div>');
                function block(title, list, cls, render) {
                    if (!list.length) return;
                    var d = el('<details class="adm-prev-block ' + cls + '"' + (cls === 'is-bad' ? ' open' : '') + '><summary></summary><ul></ul></details>');
                    d.querySelector('summary').textContent = title + ' (' + list.length + ')';
                    list.forEach(function (x) { d.querySelector('ul').appendChild(el('<li></li>')).textContent = render ? render(x) : x; });
                    body.appendChild(d);
                }
                body.appendChild(el('<p class="adm-prev-total"></p>')).textContent = r.tags.length + ' TAG en el Excel nuevo (hoy hay ' + TAGS.length + ').';
                block('Quedan sin ficha', r.removed, 'is-bad', function (t) {
                    return t + (withRecords[t] ? ' · ⚠️ tiene ' + withRecords[t] + ' registro(s): quedarían sin ficha' : '');
                });
                block('Nuevos', r.added, 'is-ok');
                block('Sin categoría (no se publican)', r.noCategory, 'is-warn');
                block('Hojas ignoradas (nombre fuera del formato 000-XX-)', r.ignored, 'is-muted');
                if (!r.tags.length) {
                    sheet({ title: 'Este Excel no sirve', body: '<p class="adm-alert">No encontré hojas con TAG (formato 100-P-01). No se subió nada.</p>' });
                    return false;
                }
                return new Promise(function (resolve) {
                    var done = false, s;
                    var ok = button('Subir y publicar', 'is-primary', function () { done = true; s.close(); resolve(true); });
                    s = sheet({ title: 'Revisá antes de publicar', body: body, actions: [button('Cancelar', 'is-ghost', function () { s.close(); }), ok], focus: false });
                    var obs = new MutationObserver(function () { if (!document.body.contains(s.el)) { obs.disconnect(); if (!done) resolve(false); } });
                    obs.observe(document.body, { childList: true });
                });
            });
        }).catch(function (e) { toast(e.message || 'No pude leer el Excel.', 'error'); return false; });
    }

    function uploadCard(title, help, accept, kind, st, box) {
        var current = st[kind + '_file'];
        var card = el('<div class="adm-card adm-upload"><h2 class="adm-h2"></h2><p class="adm-muted"></p>' +
            '<p class="adm-upload-cur"></p><label class="adm-btn is-ghost is-block adm-file"><input type="file" hidden>Elegir archivo</label>' +
            '<p class="adm-error" hidden></p></div>');
        card.querySelector('h2').textContent = title;
        card.querySelector('.adm-muted').textContent = help;
        card.querySelector('.adm-upload-cur').textContent = current ? 'Actual: ' + current.split('/').pop().replace(/^\d+-/, '') : 'Todavía no se ha subido.';
        var input = card.querySelector('input');
        input.accept = accept;
        input.addEventListener('change', function () {
            var file = input.files[0];
            if (!file) return;
            var err = card.querySelector('.adm-error');
            if (file.size > 25 * 1024 * 1024) { err.textContent = 'El archivo pesa más de 25 MB.'; err.hidden = false; return; }
            var go = kind === 'fichas' ? previewFichas(file) : Promise.resolve(true);
            if (kind === 'logo' || kind === 'qr_logo') {
                go = go.then(function (ok) { return ok && shrinkImage(file, 800).then(function (b) { file = b.size < file.size && file.type !== 'image/png' ? new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file; return true; }); });
            }
            go.then(function (ok) {
                if (!ok) { input.value = ''; return; }
                var label = card.querySelector('.adm-file');
                label.classList.add('is-busy');
                label.lastChild.textContent = 'Subiendo…';
                var safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_');
                var path = kind + '/' + Date.now() + '-' + safe;
                client.storage.from('site-sources').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' }).then(function (up) {
                    if (up.error) throw up.error;
                    var patch = {};
                    patch[kind + '_file'] = path;
                    patch[kind + '_version'] = new Date().toISOString();
                    return client.from('site_settings').update(patch).eq('id', 1).select().single();
                }).then(function (u) {
                    if (u.error) throw u.error;
                    err.hidden = true;
                    card.querySelector('.adm-upload-cur').textContent = 'Actual: ' + file.name;
                    toast('Subido. Se publica en unos 15 minutos.');
                    publishStatus(box, u.data);
                }).catch(function (e) {
                    err.textContent = /mime|type/i.test(e.message || '') ? 'Ese tipo de archivo no se acepta.' : dbError(e);
                    err.hidden = false;
                }).then(function () {
                    label.classList.remove('is-busy');
                    label.lastChild.textContent = 'Elegir archivo';
                    input.value = '';
                });
            });
        });
        return card;
    }

    // ── 📱 Códigos QR (formatos físicos de RPCI) ─────────────────────────
    // Medidas reales en mm. La Mega T-Card es la T-Card al doble (adhesivo).
    var QR_FORMATS = {
        tcard: { label: 'T-Card · 8,6 × 5,5 cm', hint: 'Tarjeta para colgar en cada equipo', w: 86, h: 55, vb: 'card', cols: 2 },
        mega:  { label: 'Mega T-Card · 17,2 × 11 cm', hint: 'Adhesivo para tanques y equipos grandes', w: 172, h: 110, vb: 'card', cols: 1 },
        key:   { label: 'Key-holder Tag · 5 × 3 cm', hint: 'Mínimo, para instrumentos pequeños', w: 50, h: 30, vb: 'key', cols: 3 },
    };
    var LOGO_QR = SITE_ROOT + 'assets/logos/LogoQR.png';
    var LOGO_QR_FALLBACK = SITE_ROOT + 'assets/logos/LogoCliente.png';
    var LOGO_RPCI = SITE_ROOT + 'assets/logos/LogoRPCI.png';

    function imgRatio(src) {
        return new Promise(function (resolve) {
            var i = new Image();
            i.onload = function () { resolve({ src: src, r: i.naturalWidth / i.naturalHeight }); };
            i.onerror = function () { resolve(null); };
            i.src = src;
        });
    }

    function qrPath(text, x, y, size) {
        var q = window.qrcode(0, 'H');      // corrección alta: aguanta el logo al centro
        q.addData(text);
        q.make();
        var n = q.getModuleCount(), quiet = 1, cell = size / (n + 2 * quiet), d = '';
        for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
            if (q.isDark(r, c)) d += 'M' + (x + (c + quiet) * cell).toFixed(3) + ' ' + (y + (r + quiet) * cell).toFixed(3) + 'h' + cell.toFixed(3) + 'v' + cell.toFixed(3) + 'h-' + cell.toFixed(3) + 'z';
        }
        return '<path d="' + d + '" fill="#000"/>';
    }

    function centerLogo(logo, x, y, size) {
        if (!logo) return '';
        var bw = size * 0.34, bh = Math.min(bw / logo.r, size * 0.24);
        bw = Math.min(bw, bh * logo.r);
        var pad = size * 0.025;
        var cx = x + size / 2, cy = y + size / 2;
        return '<rect x="' + (cx - bw / 2 - pad) + '" y="' + (cy - bh / 2 - pad) + '" width="' + (bw + 2 * pad) + '" height="' + (bh + 2 * pad) + '" rx="' + pad + '" fill="#fff"/>' +
            '<image href="' + esc(logo.src) + '" x="' + (cx - bw / 2) + '" y="' + (cy - bh / 2) + '" width="' + bw + '" height="' + bh + '" preserveAspectRatio="xMidYMid meet"/>';
    }

    function wrapText(text, maxChars, maxLines) {
        var words = String(text || '').split(/\s+/), lines = [], cur = '';
        words.forEach(function (w) {
            if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
        });
        if (cur) lines.push(cur);
        if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); }
        return lines;
    }

    function cardSvg(fmt, t, logo, rpci) {
        var url = fichaUrl(t.tag), out;
        if (fmt.vb === 'key') {
            // 50 × 30: QR + TAG
            out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30">' +
                '<rect x="0.25" y="0.25" width="49.5" height="29.5" rx="2" fill="#fff" stroke="#9aa4ae" stroke-width="0.3" stroke-dasharray="1 0.8"/>' +
                qrPath(url, 1.5, 1.5, 27) + centerLogo(logo, 1.5, 1.5, 27) +
                '<text x="39" y="14" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="4.2" textLength="19" lengthAdjust="spacingAndGlyphs">' + esc(t.tag) + '</text>' +
                '<text x="39" y="19.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="2.2" fill="#444">Escanear ficha</text></svg>';
            return out;
        }
        // 86 × 55 (la Mega usa el mismo dibujo al doble de tamaño)
        var lines = wrapText(t.servicio, 22, 3).map(function (l, i) {
            return '<text x="69.5" y="' + (36 + i * 3.6) + '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="2.9" fill="#333">' + esc(l) + '</text>';
        }).join('');
        out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 86 55">' +
            '<rect x="0.25" y="0.25" width="85.5" height="54.5" rx="3" fill="#fff" stroke="#9aa4ae" stroke-width="0.3" stroke-dasharray="1.2 1"/>' +
            qrPath(url, 2, 2, 51) + centerLogo(logo, 2, 2, 51) +
            (rpci ? '<image href="' + esc(rpci.src) + '" x="56" y="3" width="27" height="14" preserveAspectRatio="xMidYMid meet"/>' : '') +
            '<text x="69.5" y="28" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="6" textLength="' + Math.min(27, t.tag.length * 3.3) + '" lengthAdjust="spacingAndGlyphs">' + esc(t.tag) + '</text>' +
            lines +
            '<text x="69.5" y="52" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="2.3" fill="#777">Escanee para ver la ficha</text></svg>';
        return out;
    }

    function screenQr(box) {
        var cats = TAGS.map(function (t) { return t.categoria; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
        box.innerHTML = '<a class="adm-back" href="#mas">‹ Más</a><h1 class="adm-h1">Códigos QR</h1>' +
            '<p class="adm-muted">Cada QR abre la ficha del equipo. Se imprimen a tamaño real con línea de corte.</p>' +
            '<fieldset class="adm-field"><span>Formato</span><div class="adm-radio" id="qr-fmt">' +
            Object.keys(QR_FORMATS).map(function (k, i) {
                var f = QR_FORMATS[k];
                return '<label><input type="radio" name="qrfmt" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><span><strong>' + esc(f.label) + '</strong><small>' + esc(f.hint) + '</small></span></label>';
            }).join('') + '</div></fieldset>' +
            '<div class="adm-seg" id="qr-cat"><button type="button" class="is-on" data-c="">Todos</button>' +
            cats.map(function (c) { return '<button type="button" data-c="' + esc(c) + '">' + esc(c.charAt(0) + c.slice(1).toLowerCase()) + '</button>'; }).join('') + '</div>' +
            '<input type="search" class="adm-input" id="qr-q" placeholder="Filtrar TAG (opcional)" aria-label="Filtrar TAG">' +
            '<button type="button" class="adm-btn is-primary is-block" id="qr-print">🖨️ Imprimir / Guardar PDF</button>' +
            '<p class="adm-muted" id="qr-count"></p><div class="qr-sheet" id="qr-sheet">' + skeleton(2) + '</div>';
        var sheetEl = box.querySelector('#qr-sheet');
        var cat = '';
        var assets = Promise.all([loadLib(QR_URL), imgRatio(LOGO_QR).then(function (l) { return l || imgRatio(LOGO_QR_FALLBACK); }), imgRatio(LOGO_RPCI)]);
        function draw() {
            assets.then(function (a) {
                var key = box.querySelector('[name=qrfmt]:checked').value;
                var fmt = QR_FORMATS[key];
                var q = L.fold(box.querySelector('#qr-q').value);
                var list = TAGS.filter(function (t) { return (!cat || t.categoria === cat) && (!q || L.fold(t.tag + ' ' + t.servicio).indexOf(q) !== -1); });
                sheetEl.className = 'qr-sheet qr-' + key;
                sheetEl.style.setProperty('--qr-w', fmt.w + 'mm');
                sheetEl.style.setProperty('--qr-h', fmt.h + 'mm');
                sheetEl.style.setProperty('--qr-cols', fmt.cols);
                box.querySelector('#qr-count').textContent = list.length + ' etiqueta(s) · ' + fmt.label;
                sheetEl.innerHTML = list.map(function (t) { return '<div class="qr-card">' + cardSvg(fmt, t, a[1], a[2]) + '</div>'; }).join('') ||
                    empty('🔎', 'Ningún TAG con ese filtro.');
            }, function () { sheetEl.innerHTML = '<p class="adm-alert">' + esc(L.adminErrorMessage(0)) + '</p>'; });
        }
        Array.prototype.forEach.call(box.querySelectorAll('#qr-cat button'), function (b) {
            b.addEventListener('click', function () {
                cat = b.dataset.c;
                Array.prototype.forEach.call(box.querySelectorAll('#qr-cat button'), function (x) { x.classList.toggle('is-on', x === b); });
                draw();
            });
        });
        box.querySelector('#qr-fmt').addEventListener('change', draw);
        box.querySelector('#qr-q').addEventListener('input', draw);
        box.querySelector('#qr-print').addEventListener('click', function () { window.print(); });
        draw();
    }

    // ── 🪄 Auto-asignar tipo de equipo ───────────────────────────────────
    function autoAssign(cat, byTag) {
        loadSabana().then(function (lib) {
            var byCode = {};
            cat.classes.forEach(function (c) { byCode[c.code] = c; });
            var libClasses = lib.classes.filter(function (c) { return byCode[c.code]; });
            var props = TAGS.filter(function (t) { return !byTag[t.tag] || !byTag[t.tag].class_id; }).map(function (t) {
                var code = L.suggestClass(t.tag, t.texto || t.servicio, libClasses);
                return { tag: t.tag, servicio: t.servicio, cls: code ? byCode[code] : null };
            });
            var hits = props.filter(function (p) { return p.cls; });
            var body = el('<div><p class="adm-muted"></p><div class="adm-acts"></div></div>');
            body.querySelector('.adm-muted').textContent = hits.length
                ? 'Propuesta según la letra del TAG y su tipo/servicio. Desmarcá lo que no esté bien.'
                : 'No encontré sugerencias para los equipos sin tipo. Asignalos a mano.';
            hits.forEach(function (p) {
                var row = el('<label class="adm-check adm-act-check"><input type="checkbox" checked> <span><strong></strong> → <em></em><small></small></span></label>');
                row.querySelector('strong').textContent = p.tag;
                row.querySelector('em').textContent = p.cls.name;
                row.querySelector('small').textContent = p.servicio;
                row.querySelector('input').dataset.tag = p.tag;
                row.querySelector('input').dataset.cls = p.cls.id;
                body.querySelector('.adm-acts').appendChild(row);
            });
            var s;
            var apply = button('Asignar', 'is-primary', function () {
                var chosen = Array.prototype.filter.call(body.querySelectorAll('input:checked'), function () { return true; }).map(function (i) {
                    var t = i.dataset.tag, m = /^(.*\d)[AB]$/.exec(t);
                    var pairTag = m ? m[1] + (t.slice(-1) === 'A' ? 'B' : 'A') : null;
                    var hasPair = pairTag && TAGS.some(function (x) { return x.tag === pairTag; });
                    return { tag_id: t, class_id: i.dataset.cls, group_key: hasPair ? m[1] : null };
                });
                if (!chosen.length) return s.close();
                busy(apply, true);
                client.from('equipment_tags').upsert(chosen).then(function (r) {
                    busy(apply, false);
                    if (r.error) return toast(dbError(r.error), 'error');
                    s.close();
                    toast(chosen.length + ' equipo(s) asignados.');
                    route();
                });
            });
            s = sheet({ title: '🪄 Auto-asignar', body: body, actions: hits.length ? [button('Cancelar', 'is-ghost', function () { s.close(); }), apply] : [], focus: false });
        });
    }

    // ── 📷 Fotos del equipo desde el celular ─────────────────────────────
    function photosBlock(tag) {
        var wrap = el('<div class="adm-photos"><h3 class="adm-h3">Fotos tomadas desde el celular</h3><div class="adm-photo-grid"></div>' +
            '<label class="adm-btn is-ghost is-block adm-file"><input type="file" accept="image/*" capture="environment" hidden>📷 Tomar o elegir foto</label>' +
            '<p class="adm-muted">Aparecen primero en la ficha en unos 15 minutos.</p></div>');
        var grid = wrap.querySelector('.adm-photo-grid');
        var base = cfg.url + '/storage/v1/object/public/site-sources/';
        function load() {
            client.from('tag_photos').select('id,path').eq('tag_id', tag).order('created_at').then(function (r) {
                grid.innerHTML = '';
                (r.data || []).forEach(function (ph) {
                    var it = el('<div class="adm-photo"><img alt="" loading="lazy"><button type="button" class="adm-photo-del" aria-label="Quitar foto">✕</button></div>');
                    it.querySelector('img').src = base + ph.path;
                    it.querySelector('button').addEventListener('click', function () {
                        confirmSheet('Quitar foto', 'La foto deja de aparecer en la ficha de ' + tag + '.', 'Quitar', true).then(function (ok) {
                            if (!ok) return;
                            client.from('tag_photos').delete().eq('id', ph.id).then(function (d) {
                                if (d.error) return toast(dbError(d.error), 'error');
                                toast('Foto quitada.'); load();
                            });
                        });
                    });
                    grid.appendChild(it);
                });
            });
        }
        var input = wrap.querySelector('input');
        input.addEventListener('change', function () {
            var file = input.files[0];
            if (!file) return;
            var label = wrap.querySelector('.adm-file');
            label.classList.add('is-busy');
            shrinkImage(file, 1600).then(function (blob) {
                var path = 'fotos/' + tag + '/' + Date.now() + '.jpg';
                return client.storage.from('site-sources').upload(path, blob, { contentType: 'image/jpeg' }).then(function (up) {
                    if (up.error) throw up.error;
                    return client.from('tag_photos').insert({ tag_id: tag, path: path });
                });
            }).then(function (r) {
                if (r.error) throw r.error;
                toast('Foto guardada. Sale en la ficha en unos 15 minutos.');
                load();
            }).catch(function (e) { toast(dbError(e), 'error'); }).then(function () {
                label.classList.remove('is-busy');
                input.value = '';
            });
        });
        load();
        return wrap;
    }

    // ── 📥 Importar rutinas base (sábana) ────────────────────────────────
    function importSabana(cat) {
        loadSabana().then(function (lib) {
            var have = {};
            cat.classes.forEach(function (c) { have[c.code] = c; });
            var actCodes = {};
            cat.acts.forEach(function (a) { actCodes[a.class_id + '|' + a.code] = true; });
            var newClasses = lib.classes.filter(function (c) { return !have[c.code]; });
            var newActs = lib.activities.filter(function (a) { return !have[a.class_code] || !actCodes[have[a.class_code].id + '|' + a.code]; });
            var body = el('<div><p class="adm-muted">Agrega los tipos de equipo y rutinas de la biblioteca que todavía no están. No cambia lo que ya existe.</p><ul class="adm-list"></ul></div>');
            var ul = body.querySelector('ul');
            newClasses.forEach(function (c) {
                var n = newActs.filter(function (a) { return a.class_code === c.code; }).length;
                ul.appendChild(el('<li></li>')).textContent = c.name + ' (' + n + ' rutinas)';
            });
            var extra = newActs.filter(function (a) { return have[a.class_code]; });
            if (extra.length) ul.appendChild(el('<li></li>')).textContent = extra.length + ' rutina(s) nuevas en tipos que ya existen';
            if (!newClasses.length && !newActs.length) body.innerHTML = '<p class="adm-muted">Ya tenés todo lo de la biblioteca.</p>';
            var s;
            var go = button('Importar', 'is-primary', function () {
                busy(go, true, 'Importando…');
                var ins = newClasses.length
                    ? client.from('equipment_classes').insert(newClasses.map(function (c) { return { code: c.code, name: c.name, hours_per_day: c.hours_per_day }; })).select('id,code')
                    : Promise.resolve({ data: [] });
                ins.then(function (r) {
                    if (r.error) throw r.error;
                    var ids = {};
                    cat.classes.forEach(function (c) { ids[c.code] = c.id; });
                    r.data.forEach(function (c) { ids[c.code] = c.id; });
                    var perClass = {};
                    var rows = newActs.filter(function (a) {
                        var active = cat.acts.filter(function (x) { return x.class_id === ids[a.class_code] && x.active; }).length;
                        perClass[a.class_code] = (perClass[a.class_code] || active) + 1;
                        return perClass[a.class_code] <= 5;
                    }).map(function (a) {
                        return { class_id: ids[a.class_code], code: a.code, name: a.name, interval_weeks: a.interval_weeks, interval_hours: a.interval_hours };
                    });
                    return rows.length ? client.from('maintenance_activities').insert(rows) : { error: null };
                }).then(function (r) {
                    if (r.error) throw r.error;
                    s.close(); toast('Rutinas base importadas.'); route();
                }).catch(function (e) { busy(go, false); toast(dbError(e), 'error'); });
            });
            s = sheet({ title: '📥 Importar rutinas base', body: body, actions: (newClasses.length || newActs.length) ? [button('Cancelar', 'is-ghost', function () { s.close(); }), go] : [], focus: false });
        });
    }

    // ── Descargas CSV (abren en Excel: BOM + punto y coma) ──────────────────
    function downloadCsv(name, header, rows) {
        function cell(v) { var t = String(v == null ? '' : v); return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
        var csv = '\ufeff' + [header].concat(rows).map(function (r) { return r.map(cell).join(';'); }).join('\r\n');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = name + '_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    function exportRutinas(btn) {
        btn.disabled = true;
        loadCatalog().then(function (cat) {
            var byId = {};
            cat.classes.forEach(function (c) { byId[c.id] = c; });
            var rows = cat.acts.map(function (a) {
                var c = byId[a.class_id] || {};
                return [c.name, a.name, a.interval_weeks || '', a.interval_hours || '', freqLabel(a.interval_weeks, a.interval_hours), a.active ? 'Sí' : 'No'];
            }).sort(function (x, y) { return String(x[0]).localeCompare(y[0], 'es'); });
            downloadCsv('rutinas', ['Tipo de equipo', 'Rutina', 'Cada (semanas)', 'Cada (horas)', 'Frecuencia', 'Activa'], rows);
            toast('Descarga lista.');
        }).catch(function (e) { toast(dbError(e), 'error'); }).then(function () { btn.disabled = false; });
    }

    function exportEquipos(btn) {
        btn.disabled = true;
        loadCatalog().then(function (cat) {
            var cls = {};
            cat.classes.forEach(function (c) { cls[c.id] = c.name; });
            var byTag = {};
            cat.tags.forEach(function (t) { byTag[t.tag_id] = t; });
            var rows = TAGS.map(function (t) {
                var r = byTag[t.tag] || {};
                return [t.tag, t.categoria, t.servicio, cls[r.class_id] || 'Sin tipo', REGIMES[r.regime] || ''];
            });
            downloadCsv('equipos', ['TAG', 'Categoría', 'Servicio', 'Tipo de equipo', 'Papel en el par'], rows);
            toast('Descarga lista.');
        }).catch(function (e) { toast(dbError(e), 'error'); }).then(function () { btn.disabled = false; });
    }

    function exportRegistros(btn) {
        busy(btn, true, 'Preparando…');
        var since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
        var all = [];
        function page(last) {
            var q = recordsQuery().gte('performed_at', since).limit(1000);
            if (last) {
                q = q.or('performed_at.lt.' + last.performed_at +
                    ',and(performed_at.eq.' + last.performed_at + ',created_at.lt.' + last.created_at + ')' +
                    ',and(performed_at.eq.' + last.performed_at + ',created_at.eq.' + last.created_at + ',id.lt.' + last.id + ')');
            }
            return q.then(function (r) {
                if (r.error) throw r.error;
                all = all.concat(r.data);
                if (r.data.length === 1000 && all.length < 50000) return page(r.data[r.data.length - 1]);
            });
        }
        page(null).then(function () { return withAuthors(all); }).then(function (rows) {
            downloadCsv('registros', ['Fecha', 'TAG', 'Tipo', 'Descripción', 'Rutinas', 'Repuestos', 'Horas HMI', 'Autor'], rows.map(function (r) {
                var acts = (r.maintenance_record_activities || []).map(function (a) { return a.maintenance_activities ? a.maintenance_activities.name : ''; }).filter(Boolean).join(' | ');
                return [r.performed_at, r.tag_id, r.type, r.description, acts, r.parts_used || '', r.hmi_hours == null ? '' : r.hmi_hours, r.author];
            }));
            toast(rows.length + ' registros descargados.');
        }).catch(function (e) { toast(dbError(e), 'error'); }).then(function () { busy(btn, false); });
    }

    // ── 👥 Usuarios ───────────────────────────────────────────────────────
    function screenUsuarios(box) {
        box.innerHTML = '<a class="adm-back" href="#mas">‹ Más</a><h1 class="adm-h1">Usuarios</h1>' +
            '<div class="adm-searchbar"><input type="search" class="adm-input" id="us-q" placeholder="Buscar por nombre o correo" aria-label="Buscar usuario"></div>' +
            '<div class="adm-seg" role="tablist"><button type="button" class="is-on" data-st="activos">Activos</button><button type="button" data-st="desactivados">Desactivados</button></div>' +
            '<div id="us-list">' + skeleton(4) + '</div>' +
            '<button type="button" class="adm-fab" id="us-new">＋ Nuevo usuario</button>';
        var status = 'activos';
        var users = [];
        var list = box.querySelector('#us-list');
        var input = box.querySelector('#us-q');
        function draw() {
            var rows = L.filterUsers(users, input.value, status);
            list.innerHTML = '';
            if (!rows.length) { list.innerHTML = empty('👥', status === 'activos' ? 'No hay usuarios activos con ese filtro.' : 'No hay usuarios desactivados.'); return; }
            rows.forEach(function (u) {
                var me = u.user_id === state.session.user.id;
                var card = el('<button type="button" class="adm-card adm-user"><span class="adm-avatar"></span><span class="adm-user-main"><strong></strong><small></small></span><span class="adm-chip"></span></button>');
                card.querySelector('.adm-avatar').textContent = (u.full_name || '?').trim().charAt(0).toUpperCase();
                card.querySelector('strong').textContent = u.full_name + (me ? ' (vos)' : '');
                card.querySelector('small').textContent = u.email;
                card.querySelector('.adm-chip').textContent = L.roleLabel(u.role);
                if (u.role === 'oficina') card.querySelector('.adm-chip').classList.add('is-accent');
                card.addEventListener('click', function () { userActions(u, me, reload); });
                list.appendChild(card);
            });
        }
        function reload() {
            list.innerHTML = skeleton(4);
            callUsers('list').then(function (data) { users = data; draw(); }, function (e) {
                list.innerHTML = '<p class="adm-alert">' + esc(e.message) + '</p>';
                if (e.status === 401) onAuthError(e);
            });
        }
        input.addEventListener('input', draw);
        Array.prototype.forEach.call(box.querySelectorAll('.adm-seg button'), function (b) {
            b.addEventListener('click', function () {
                status = b.dataset.st;
                Array.prototype.forEach.call(box.querySelectorAll('.adm-seg button'), function (x) { x.classList.toggle('is-on', x === b); });
                draw();
            });
        });
        box.querySelector('#us-new').addEventListener('click', function () { newUser(reload); });
        reload();
    }

    function newUser(reload) {
        var d = state.draft;
        var form = el('<form class="adm-form" novalidate>' +
            '<label class="adm-field"><span>Nombre completo</span><input name="full_name" maxlength="80" autocomplete="off" required></label><p class="adm-error" data-for="full_name" hidden></p>' +
            '<label class="adm-field"><span>Correo</span><input type="email" name="email" inputmode="email" autocomplete="off" autocapitalize="off" required></label><p class="adm-error" data-for="email" hidden></p>' +
            '<fieldset class="adm-field"><span>Perfil</span><div class="adm-radio">' +
            '<label><input type="radio" name="role" value="tecnico"><span><strong>Técnico</strong><small>Registra mantenimientos desde el celular.</small></span></label>' +
            '<label><input type="radio" name="role" value="oficina"><span><strong>Oficina</strong><small>Todo lo administrativo: usuarios, rutinas, equipos y registros.</small></span></label>' +
            '</div></fieldset><p class="adm-error" data-for="role" hidden></p><p class="adm-error" data-for="server" hidden></p></form>');
        form.full_name.value = d.full_name || '';
        form.email.value = d.email || '';
        Array.prototype.forEach.call(form.role, function (r) { r.checked = r.value === (d.role || 'tecnico'); });
        form.addEventListener('input', function () {
            state.draft = { full_name: form.full_name.value, email: form.email.value, role: form.role.value };
        });
        var save = button('Crear usuario', 'is-primary', function () {
            var data = { full_name: form.full_name.value, email: L.normalizeEmail(form.email.value), role: form.role.value };
            var v = L.validateNewUser(data);
            Array.prototype.forEach.call(form.querySelectorAll('.adm-error'), function (p) {
                var msg = v.errors[p.dataset.for];
                p.textContent = msg || '';
                p.hidden = !msg;
            });
            if (!v.ok) return;
            busy(save, true, 'Creando…');
            callUsers('create', data).then(function (res) {
                busy(save, false);
                state.draft = {};
                s.close();
                showTempPassword(data, res.temp_password, 'Usuario creado');
                reload();
            }, function (e) {
                busy(save, false);
                var p = form.querySelector('[data-for=server]');
                p.textContent = e.message;
                p.hidden = false;
                if (e.status === 401) onAuthError(e);
            });
        });
        var s = sheet({ title: 'Nuevo usuario', body: form, actions: [button('Cancelar', 'is-ghost', function () { s.close(); }), save] });
    }

    function showTempPassword(u, pwd, title) {
        var body = el('<div class="adm-temp"><p>' + esc(u.full_name) + ' · ' + esc(u.email) + '</p>' +
            '<div class="adm-temp-pwd" aria-label="Contraseña temporal"></div>' +
            '<p class="adm-note">Esta contraseña no se vuelve a mostrar. Compartila ahora y pedile que la cambie en "Mi cuenta".</p></div>');
        body.querySelector('.adm-temp-pwd').textContent = pwd;
        var copy = button('Copiar', 'is-ghost', function () {
            (navigator.clipboard ? navigator.clipboard.writeText(pwd) : Promise.reject()).then(function () { toast('Contraseña copiada.'); }, function () { toast('Mantené presionada la contraseña para copiarla.'); });
        });
        var wa = el('<a class="adm-btn is-wa" target="_blank" rel="noopener">Compartir por WhatsApp</a>');
        wa.href = L.whatsappShareUrl({ full_name: u.full_name, email: u.email, temp_password: pwd, admin_url: ADMIN_URL });
        sheet({ title: title, body: body, actions: [copy, wa], focus: false });
    }

    function userActions(u, me, reload) {
        var body = el('<div class="adm-detail"><dl><dt>Correo</dt><dd></dd><dt>Perfil</dt><dd></dd><dt>Estado</dt><dd></dd><dt>Último ingreso</dt><dd></dd></dl></div>');
        var dd = body.querySelectorAll('dd');
        dd[0].textContent = u.email;
        dd[1].textContent = L.roleLabel(u.role);
        dd[2].textContent = u.active ? 'Activo' : 'Desactivado';
        dd[3].textContent = u.last_sign_in_at ? L.formatDate(u.last_sign_in_at) : 'Nunca';
        var s;
        function act(action, extra, okMsg) {
            return callUsers(action, Object.assign({ user_id: u.user_id }, extra || {})).then(function (res) {
                s.close();
                toast(okMsg);
                reload();
                return res;
            }, function (e) { onAuthError(e); });
        }
        var actions = [];
        var other = u.role === 'oficina' ? 'tecnico' : 'oficina';
        actions.push(button('Cambiar a ' + L.roleLabel(other), 'is-ghost', function () {
            confirmSheet('Cambiar perfil', u.full_name + ' pasa a perfil ' + L.roleLabel(other) + '.', 'Cambiar').then(function (ok) {
                if (ok) act('set_role', { role: other }, 'Perfil cambiado.').then(function () { if (me) boot(); });
            });
        }));
        actions.push(button('Restablecer contraseña', 'is-ghost', function () {
            confirmSheet('Restablecer contraseña', 'Se genera una contraseña temporal nueva para ' + u.full_name + '. La actual deja de funcionar.', 'Restablecer').then(function (ok) {
                if (ok) act('reset_password', {}, 'Contraseña restablecida.').then(function (res) { if (res) showTempPassword(u, res.temp_password, 'Contraseña nueva'); });
            });
        }));
        if (!me) {
            actions.push(u.active
                ? button('Desactivar', 'is-danger', function () {
                    confirmSheet('Desactivar a ' + u.full_name, u.full_name + ' no podrá entrar. Su historial se conserva.', 'Desactivar', true).then(function (ok) {
                        if (ok) act('deactivate', {}, 'Usuario desactivado.');
                    });
                })
                : button('Reactivar', 'is-primary', function () { act('reactivate', {}, 'Usuario reactivado.'); }));
        }
        s = sheet({ title: u.full_name, body: body, actions: actions, focus: false });
        s.el.querySelector('.adm-sheet-foot').classList.add('is-stack');
    }

    // ── 🔑 Mi cuenta ──────────────────────────────────────────────────────
    function screenCuenta(box) {
        var p = state.profile;
        box.innerHTML = (p.role === 'oficina' ? '<a class="adm-back" href="#mas">‹ Más</a>' : '') +
            '<h1 class="adm-h1">Mi cuenta</h1><div class="adm-card adm-detail"><dl><dt>Nombre</dt><dd></dd><dt>Correo</dt><dd></dd><dt>Perfil</dt><dd></dd></dl></div>' +
            '<form class="adm-form adm-card" novalidate><h2 class="adm-h2">Cambiar mi contraseña</h2>' +
            '<label class="adm-field"><span>Contraseña nueva</span><input type="password" name="p1" autocomplete="new-password" minlength="8"></label>' +
            '<label class="adm-field"><span>Repetila</span><input type="password" name="p2" autocomplete="new-password"></label>' +
            '<label class="adm-check"><input type="checkbox" name="show"> Mostrar</label><p class="adm-error" hidden></p>' +
            '<button type="submit" class="adm-btn is-primary is-block">Cambiar contraseña</button></form>' +
            '<button type="button" class="adm-btn is-ghost is-block" id="logout">Cerrar sesión</button>';
        var dd = box.querySelectorAll('dd');
        dd[0].textContent = p.full_name;
        dd[1].textContent = state.session.user.email;
        dd[2].textContent = L.roleLabel(p.role);
        var form = box.querySelector('form');
        form.show.addEventListener('change', function () { form.p1.type = form.p2.type = form.show.checked ? 'text' : 'password'; });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var err = form.querySelector('.adm-error');
            var v = L.validateNewPassword(form.p1.value, form.p2.value);
            if (!v.ok) { err.textContent = v.error; err.hidden = false; return; }
            var btn = form.querySelector('[type=submit]');
            busy(btn, true);
            client.auth.updateUser({ password: form.p1.value }).then(function (r) {
                busy(btn, false);
                if (r.error) { err.textContent = /different|same/i.test(r.error.message) ? 'La contraseña nueva debe ser distinta de la actual.' : dbError(r.error); err.hidden = false; return; }
                err.hidden = true;
                form.reset();
                toast('Listo, tu contraseña cambió.');
            });
        });
        box.querySelector('#logout').addEventListener('click', function () {
            client.auth.signOut().then(function () { location.hash = ''; showLogin(); });
        });
    }

    var SCREENS = {
        resumen: screenResumen, registros: screenRegistros, rutinas: screenRutinas, equipos: screenEquipos,
        mas: screenMas, usuarios: screenUsuarios, cuenta: screenCuenta, sitio: screenSitio, qr: screenQr,
    };

    // ── arranque ──────────────────────────────────────────────────────────
    function syncOnline() { document.getElementById('adm-offline').hidden = navigator.onLine; }
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    window.addEventListener('hashchange', route);
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && state.profile && !document.querySelector('.adm-sheet-wrap')) route();
    });
    client.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_OUT' && state.profile) showLogin();
    });
    syncOnline();
    boot();
})();
