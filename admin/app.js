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
    function freqLabel(weeks) {
        var f = FREQS.filter(function (x) { return x.weeks === weeks; })[0];
        return f ? f.label : (weeks ? 'Cada ' + weeks + ' semanas' : 'Sin frecuencia');
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
        var navId = res.id === 'usuarios' || (res.id === 'cuenta' && state.profile.role === 'oficina') ? 'mas' : res.id;
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
            .select('id,tag_id,performed_at,created_at,description,hmi_hours,created_by,' +
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
            '<span class="adm-rec-top"><strong>' + esc(rec.tag_id) + '</strong><span>' + esc(L.formatDate(rec.performed_at)) + '</span></span>' +
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
            '<dt>Autor</dt><dd>' + esc(rec.author || '') + '</dd>' +
            (rec.hmi_hours != null ? '<dt>Horas HMI</dt><dd>' + esc(rec.hmi_hours) + '</dd>' : '') +
            '</dl><p class="adm-pre"></p>' +
            (acts.length ? '<h3 class="adm-h3">Rutinas</h3><ul class="adm-list">' + acts.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
            '<a class="adm-btn is-ghost is-block" href="' + esc(fichaUrl(rec.tag_id)) + '">Ver ficha y fotos</a></div>');
        body.querySelector('.adm-pre').textContent = rec.description;
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

    function editRecord(rec) {
        var form = el('<form class="adm-form" novalidate>' +
            '<label class="adm-field"><span>Fecha</span><input type="date" name="fecha" required></label>' +
            '<label class="adm-field"><span>Descripción</span><textarea name="desc" rows="4" required></textarea></label>' +
            '<label class="adm-field"><span>Horas HMI (opcional)</span><input type="number" name="hmi" min="0" step="0.1" inputmode="decimal"></label>' +
            '<p class="adm-error" hidden></p></form>');
        form.fecha.value = rec.performed_at;
        form.desc.value = rec.description;
        if (rec.hmi_hours != null) form.hmi.value = rec.hmi_hours;
        var save = button('Guardar', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            if (!form.fecha.value || !form.desc.value.trim()) { err.textContent = 'La fecha y la descripción son obligatorias.'; err.hidden = false; return; }
            busy(save, true);
            client.from('maintenance_records').update({
                performed_at: form.fecha.value, description: form.desc.value.trim(),
                hmi_hours: form.hmi.value === '' ? null : Number(form.hmi.value),
            }).eq('id', rec.id).then(function (r) {
                busy(save, false);
                if (r.error) { err.textContent = dbError(r.error); err.hidden = false; return; }
                s.close();
                toast('Registro actualizado.');
                route();
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
            client.from('maintenance_activities').select('id,class_id,code,name,interval_weeks,active').order('name'),
            client.from('equipment_tags').select('tag_id,class_id,group_key'),
        ]).then(function (r) {
            var err = r[0].error || r[1].error || r[2].error;
            if (err) throw err;
            return { classes: r[0].data, acts: r[1].data, tags: r[2].data };
        });
    }

    function screenRutinas(box) {
        box.innerHTML = '<h1 class="adm-h1">Rutinas</h1><p class="adm-muted">Por tipo de equipo · máximo 5 activas.</p><div id="cls">' + skeleton(4) + '</div>' +
            '<button type="button" class="adm-fab" id="cls-new" aria-label="Nuevo tipo de equipo">＋ Tipo de equipo</button>';
        box.querySelector('#cls-new').addEventListener('click', newClass);
        loadCatalog().then(function (cat) {
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
                    row.querySelector('.adm-chip').textContent = freqLabel(a.interval_weeks);
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
                var add = button('＋ Rutina', 'is-ghost is-block', function () { editActivity(c, null, acts); });
                if (active.length >= 5) { add.disabled = true; add.textContent = 'Máximo 5 rutinas activas'; }
                bodyEl.appendChild(add);
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
            freqField(act ? act.interval_weeks : 4) + '<p class="adm-error" hidden></p></form>');
        form.name.value = act ? act.name : '';
        form.freq.addEventListener('change', function () { form.querySelector('[data-otra]').hidden = form.freq.value !== 'otra'; });
        var save = button(act ? 'Guardar' : 'Agregar rutina', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            var name = form.name.value.trim();
            var weeks = form.freq.value === 'otra' ? parseInt(form.weeks.value, 10) : parseInt(form.freq.value, 10);
            if (!name) { err.textContent = 'Escribí el nombre de la rutina.'; err.hidden = false; return; }
            if (!weeks || weeks < 1) { err.textContent = 'Indicá cada cuántas semanas.'; err.hidden = false; return; }
            busy(save, true);
            var req;
            if (act) {
                req = client.from('maintenance_activities').update({ name: name, interval_weeks: weeks }).eq('id', act.id);
            } else {
                var code = slug(name);
                var used = acts.map(function (a) { return a.code; });
                var n = 2;
                var base = code;
                while (used.indexOf(code) !== -1) code = base.slice(0, 21) + '-' + n++;
                req = client.from('maintenance_activities').insert({ class_id: cls.id, code: code, name: name, interval_weeks: weeks });
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
                list.innerHTML = missing ? '<p class="adm-alert">' + missing + ' equipo(s) sin tipo asignado.</p>' : '';
                if (!rows.length) { list.innerHTML += empty('🔎', 'Ningún equipo coincide.'); return; }
                rows.forEach(function (t) {
                    var cur = byTag[t.tag] && classes[byTag[t.tag].class_id];
                    var pair = pairOf(t.tag);
                    var card = el('<button type="button" class="adm-card adm-eq"><span class="adm-rec-top"><strong></strong><span class="adm-chip"></span></span>' +
                        '<span class="adm-rec-desc"></span>' + (pair ? '<span class="adm-rec-meta">Par con ' + esc(pair) + ' · cada uno con su historial</span>' : '') + '</button>');
                    card.querySelector('strong').textContent = t.tag;
                    card.querySelector('.adm-chip').textContent = cur ? cur.name : 'Sin tipo';
                    if (!cur) card.querySelector('.adm-chip').classList.add('is-warn');
                    card.querySelector('.adm-rec-desc').textContent = t.servicio;
                    card.addEventListener('click', function () { assignClass(t, cur, cat.classes, pair); });
                    list.appendChild(card);
                });
            }
            input.addEventListener('input', draw);
            draw();
        }).catch(function (e) { box.querySelector('#eq-list').innerHTML = '<p class="adm-alert">' + esc(dbError(e)) + '</p>'; });
    }

    function assignClass(t, cur, classes, pair) {
        var form = el('<form class="adm-form" novalidate><p class="adm-muted"></p><label class="adm-field"><span>Tipo de equipo</span><select name="cls"><option value="">— Elegí —</option>' +
            classes.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
            (cur ? '<p class="adm-note">Las rutinas de los registros anteriores se conservan; las fechas se calculan con las rutinas del tipo nuevo.</p>' : '') +
            '<p class="adm-error" hidden></p></form>');
        form.querySelector('.adm-muted').textContent = t.servicio;
        if (cur) form.cls.value = cur.id;
        var save = button('Guardar', 'is-primary', function () {
            var err = form.querySelector('.adm-error');
            if (!form.cls.value) { err.textContent = 'Elegí un tipo de equipo.'; err.hidden = false; return; }
            busy(save, true);
            var group = pair ? t.tag.replace(/[AB]$/, '') : null;
            client.from('equipment_tags').upsert({ tag_id: t.tag, class_id: form.cls.value, group_key: group }).then(function (r) {
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
            '<a class="adm-card adm-menu-item" href="#cuenta"><span>🔑</span><strong>Mi cuenta</strong><em>›</em></a>' +
            '<a class="adm-card adm-menu-item" href="../mantenimientos.html"><span>🛠</span><strong>Ver el sitio de mantenimientos</strong><em>›</em></a>' +
            '</div>';
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
        mas: screenMas, usuarios: screenUsuarios, cuenta: screenCuenta,
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
