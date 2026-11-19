const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../admin_logic.js');

test('normalizeEmail quita espacios y mayúsculas', () => {
    assert.equal(L.normalizeEmail(' Juan@Planta.COM '), 'juan@planta.com');
});

test('validateNewUser marca los tres campos inválidos', () => {
    const r = L.validateNewUser({ email: 'x', full_name: '', role: 'admin' });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'full_name', 'role']);
    assert.equal(L.validateNewUser({ email: 'a@b.co', full_name: 'Ana', role: 'tecnico' }).ok, true);
});

test('validateNewPassword exige 8 caracteres e igualdad', () => {
    assert.equal(L.validateNewPassword('corta', 'corta').ok, false);
    assert.equal(L.validateNewPassword('Segura123', 'Otra1234').ok, false);
    assert.equal(L.validateNewPassword('Segura123', 'Segura123').ok, true);
});

test('filterUsers busca sin tildes y filtra por estado', () => {
    const users = [
        { full_name: 'José Pérez', email: 'jp@x.co', active: true },
        { full_name: 'Ana', email: 'ana@x.co', active: false },
    ];
    assert.deepEqual(L.filterUsers(users, 'jose', 'activos').map(u => u.full_name), ['José Pérez']);
    assert.deepEqual(L.filterUsers(users, '', 'desactivados').map(u => u.full_name), ['Ana']);
    assert.deepEqual(L.filterUsers(users, 'ANA@', 'desactivados').map(u => u.full_name), ['Ana']);
});

test('roleLabel', () => {
    assert.equal(L.roleLabel('tecnico'), 'Técnico');
    assert.equal(L.roleLabel('oficina'), 'Oficina');
});

test('whatsappShareUrl incluye correo, clave y enlace', () => {
    const url = L.whatsappShareUrl({
        full_name: 'Ana', email: 'ana@x.co', temp_password: 'Ptar-abcd-efgh',
        admin_url: 'https://x.github.io/y/admin/',
    });
    assert.ok(url.startsWith('https://wa.me/?text='));
    const text = decodeURIComponent(url.slice('https://wa.me/?text='.length));
    for (const s of ['ana@x.co', 'Ptar-abcd-efgh', 'https://x.github.io/y/admin/']) assert.ok(text.includes(s));
});

test('adminErrorMessage', () => {
    assert.equal(L.adminErrorMessage(0), 'Sin conexión. No se guardó nada; intentá de nuevo.');
    assert.equal(L.adminErrorMessage(401), 'Tu sesión expiró. Entrá de nuevo.');
    assert.equal(L.adminErrorMessage(403), 'Tu usuario no tiene perfil oficina.');
    assert.equal(L.adminErrorMessage(409, 'Ya existe un usuario con ese correo.'), 'Ya existe un usuario con ese correo.');
    assert.equal(L.adminErrorMessage(500), 'Algo falló. Intentá de nuevo.');
});

test('routesFor y resolve según perfil', () => {
    assert.deepEqual(L.routesFor('tecnico').map(r => r.id), ['resumen', 'registros', 'cuenta']);
    assert.deepEqual(L.routesFor('oficina').map(r => r.id), ['resumen', 'registros', 'rutinas', 'equipos', 'mas']);
    assert.deepEqual(L.resolve('#rutinas', 'tecnico'), { id: 'resumen', denied: true });
    assert.deepEqual(L.resolve('', 'oficina'), { id: 'resumen', denied: false });
    assert.deepEqual(L.resolve('#usuarios', 'oficina'), { id: 'usuarios', denied: false });
    assert.deepEqual(L.resolve('#usuarios', 'tecnico'), { id: 'resumen', denied: true });
});

test('formatDate en español corto', () => {
    assert.equal(L.formatDate('2026-11-17'), '17 nov 2026');
    assert.equal(L.formatDate(null), '—');
});

test('expandSheet y categoryOf como convert_fichas', () => {
    assert.deepEqual(L.expandSheet('100-P-01A-B'), ['100-P-01A', '100-P-01B']);
    assert.deepEqual(L.expandSheet('400-C-01 A-B'), ['400-C-01A', '400-C-01B']);
    assert.deepEqual(L.expandSheet('400-MX-01_02_03'), ['400-MX-01', '400-MX-02', '400-MX-03']);
    assert.equal(L.categoryOf('600-SD-01'), 'TANQUES');
    assert.equal(L.categoryOf('100-HX-01'), null);
});

test('previewSheets detecta nuevos, quitados, ignorados y sin categoría', () => {
    const r = L.previewSheets(['100-P-01A-B', 'Hoja3', '100-HX-01', '900-TK-01'], ['100-P-01A', '100-P-01B', '400-R-01']);
    assert.deepEqual(r.added, ['900-TK-01']);
    assert.deepEqual(r.removed, ['400-R-01']);
    assert.deepEqual(r.ignored, ['Hoja3']);
    assert.deepEqual(r.noCategory, ['100-HX-01']);
});

test('suggestClass igual que maintenance_plan', () => {
    const classes = [
        { code: 'NEU', tag_letters: ['P'], keywords: ['neumatica', 'diafragma'] },
        { code: 'SUM', tag_letters: ['P'], keywords: ['sumergible'] },
    ];
    assert.equal(L.suggestClass('600-P-02', 'Neumática WILDEN', classes), 'NEU');
    assert.equal(L.suggestClass('100-P-01A', 'Bomba sumergible', classes), 'SUM');
    assert.equal(L.suggestClass('100-TK-01', 'Tanque', classes), null);
    assert.equal(L.suggestClass('Hoja3', 'sumergible', classes), null);
});
