// Lógica pura de la administración web (sin DOM). Se usa en /admin/ y en la
// ficha ("Cambiar mi contraseña"). Tests: tests/js/admin_logic.test.js
(function (root) {
    'use strict';

    var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    var ROUTES = {
        resumen:   { id: 'resumen',   icon: '🏠', label: 'Resumen' },
        registros: { id: 'registros', icon: '📋', label: 'Registros' },
        rutinas:   { id: 'rutinas',   icon: '🔧', label: 'Rutinas' },
        equipos:   { id: 'equipos',   icon: '⚙️', label: 'Equipos' },
        mas:       { id: 'mas',       icon: '☰', label: 'Más' },
        cuenta:    { id: 'cuenta',    icon: '🔑', label: 'Mi cuenta' },
        usuarios:  { id: 'usuarios',  icon: '👥', label: 'Usuarios' },
        sitio:     { id: 'sitio',     icon: '🌐', label: 'Sitio' },
        qr:        { id: 'qr',        icon: '📱', label: 'Códigos QR' },
    };
    var NAV = {
        tecnico: ['resumen', 'registros', 'cuenta'],
        oficina: ['resumen', 'registros', 'rutinas', 'equipos', 'mas'],
    };
    // Pantallas alcanzables por perfil (incluye las que viven dentro de "Más").
    var ALLOWED = {
        tecnico: ['resumen', 'registros', 'cuenta'],
        oficina: ['resumen', 'registros', 'rutinas', 'equipos', 'mas', 'usuarios', 'cuenta', 'sitio', 'qr'],
    };

    function fold(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }

    function normalizeEmail(s) {
        return String(s || '').trim().toLowerCase();
    }

    function validateNewUser(u) {
        var errors = {};
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(u.email))) errors.email = 'Escribí un correo válido.';
        var name = String(u.full_name || '').trim();
        if (!name || name.length > 80) errors.full_name = 'Escribí el nombre (máx. 80 caracteres).';
        if (u.role !== 'tecnico' && u.role !== 'oficina') errors.role = 'Elegí el perfil.';
        return { ok: Object.keys(errors).length === 0, errors: errors };
    }

    function validateNewPassword(pwd, confirm) {
        if (String(pwd || '').length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
        if (pwd !== confirm) return { ok: false, error: 'Las dos contraseñas no coinciden.' };
        return { ok: true };
    }

    function filterUsers(users, query, status) {
        var q = fold(query);
        var wantActive = status !== 'desactivados';
        return users.filter(function (u) {
            if (Boolean(u.active) !== wantActive) return false;
            return !q || fold(u.full_name).indexOf(q) !== -1 || fold(u.email).indexOf(q) !== -1;
        });
    }

    function roleLabel(role) {
        return role === 'oficina' ? 'Oficina' : 'Técnico';
    }

    function whatsappShareUrl(o) {
        var text = 'Hola ' + o.full_name + ', este es tu acceso al sistema de mantenimiento:\n' +
            'Usuario: ' + o.email + '\n' +
            'Contraseña temporal: ' + o.temp_password + '\n' +
            'Entrá en ' + o.admin_url + ' y cambiala en "Mi cuenta".';
        return 'https://wa.me/?text=' + encodeURIComponent(text);
    }

    function adminErrorMessage(status, serverMsg) {
        if (status === 0) return 'Sin conexión. No se guardó nada; intentá de nuevo.';
        if (status === 401) return 'Tu sesión expiró. Entrá de nuevo.';
        if (status === 403) return 'Tu usuario no tiene perfil oficina.';
        return serverMsg || 'Algo falló. Intentá de nuevo.';
    }

    function routesFor(role) {
        return (NAV[role] || NAV.tecnico).map(function (id) { return ROUTES[id]; });
    }

    function resolve(hash, role) {
        var id = String(hash || '').replace(/^#/, '') || 'resumen';
        var allowed = ALLOWED[role] || ALLOWED.tecnico;
        if (allowed.indexOf(id) === -1) {
            return { id: 'resumen', denied: Boolean(ROUTES[id]) };
        }
        return { id: id, denied: false };
    }

    function formatDate(iso) {
        if (!iso) return '—';
        var p = String(iso).slice(0, 10).split('-');
        return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0];
    }

    var SHEET_RE = /^\d{3}-[A-Z]+-/;
    var CATS = [
        [/^(TK|R|F|SD)$/, 'TANQUES'], [/^(P|MX|M|C|PS)$/, 'EQUIPOS'], [/^(AIT|FIT|SV|LT)$/, 'INSTRUMENTOS'],
    ];

    // Mismo criterio que expand_tags_from_sheet_name(): "100-P-01 A-B" → 100-P-01A, 100-P-01B
    function expandSheet(name) {
        var n = String(name || '').trim();
        var m = /^(.+?)\s*A[_/-]B\s*$/.exec(n);
        if (m) return [m[1].trim() + 'A', m[1].trim() + 'B'];
        m = /^(.+?-)(\d+(?:_\d+)+)$/.exec(n);
        if (m) return m[2].split('_').map(function (x) { return m[1] + x; });
        return [n];
    }

    function categoryOf(tag) {
        var m = /^\d{3}-([A-Z]+)-/.exec(tag);
        if (!m) return null;
        for (var i = 0; i < CATS.length; i++) if (CATS[i][0].test(m[1])) return CATS[i][1];
        return null;
    }

    function previewSheets(sheetNames, currentTags) {
        var tags = [], ignored = [], noCat = [];
        sheetNames.forEach(function (s) {
            if (!SHEET_RE.test(s)) { ignored.push(s); return; }
            expandSheet(s).forEach(function (t) { if (categoryOf(t)) tags.push(t); else noCat.push(t); });
        });
        var cur = {}, nxt = {};
        currentTags.forEach(function (t) { cur[t] = true; });
        tags.forEach(function (t) { nxt[t] = true; });
        return {
            tags: tags, ignored: ignored, noCategory: noCat,
            added: tags.filter(function (t) { return !cur[t]; }),
            removed: currentTags.filter(function (t) { return !nxt[t]; }),
        };
    }

    // Espejo de maintenance_plan.suggest_class: letra del TAG + palabra clave en el texto
    function suggestClass(tag, text, classes) {
        var m = /^\d{3}-([A-Z]+)-/.exec(tag || '');
        if (!m) return null;
        var t = fold(text);
        for (var i = 0; i < classes.length; i++) {
            var c = classes[i];
            if (c.tag_letters.indexOf(m[1]) !== -1 && c.keywords.some(function (k) { return t.indexOf(fold(k)) !== -1; })) return c.code;
        }
        return null;
    }

    var api = {
        expandSheet: expandSheet, categoryOf: categoryOf, previewSheets: previewSheets, suggestClass: suggestClass,
        normalizeEmail: normalizeEmail, validateNewUser: validateNewUser,
        validateNewPassword: validateNewPassword, filterUsers: filterUsers, roleLabel: roleLabel,
        whatsappShareUrl: whatsappShareUrl, adminErrorMessage: adminErrorMessage,
        routesFor: routesFor, resolve: resolve, formatDate: formatDate, fold: fold, ROUTES: ROUTES,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.AdminLogic = api;
})(typeof window !== 'undefined' ? window : this);
