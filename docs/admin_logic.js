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
    };
    var NAV = {
        tecnico: ['resumen', 'registros', 'cuenta'],
        oficina: ['resumen', 'registros', 'rutinas', 'equipos', 'mas'],
    };
    // Pantallas alcanzables por perfil (incluye las que viven dentro de "Más").
    var ALLOWED = {
        tecnico: ['resumen', 'registros', 'cuenta'],
        oficina: ['resumen', 'registros', 'rutinas', 'equipos', 'mas', 'usuarios', 'cuenta', 'sitio'],
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

    var api = {
        normalizeEmail: normalizeEmail, validateNewUser: validateNewUser,
        validateNewPassword: validateNewPassword, filterUsers: filterUsers, roleLabel: roleLabel,
        whatsappShareUrl: whatsappShareUrl, adminErrorMessage: adminErrorMessage,
        routesFor: routesFor, resolve: resolve, formatDate: formatDate, fold: fold, ROUTES: ROUTES,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.AdminLogic = api;
})(typeof window !== 'undefined' ? window : this);
