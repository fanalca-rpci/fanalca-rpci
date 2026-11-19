const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../maintenance_agenda.js');

test('weekBounds: lunes a domingo', () => {
    assert.deepEqual(A.weekBounds('2026-10-14', 0), ['2026-10-12', '2026-10-18']);
    assert.deepEqual(A.weekBounds('2026-10-18', 0), ['2026-10-12', '2026-10-18']);
    assert.deepEqual(A.weekBounds('2026-10-14', 1), ['2026-10-19', '2026-10-25']);
});

test('todayIso usa la hora de Colombia', () => {
    // 2026-10-15 03:00 UTC = 2026-10-14 22:00 en Bogotá
    assert.equal(A.todayIso(new Date(Date.UTC(2026, 9, 15, 3, 0))), '2026-10-14');
});

const AGENDA = [
    { tag_id: 'B', due_date: '2026-10-16', status: 'proximo' },
    { tag_id: 'A', due_date: '2026-10-20', status: 'proximo' },
    { tag_id: 'C', due_date: null, status: 'sin_registro' },
    { tag_id: 'D', due_date: '2026-10-01', status: 'vencido', days_overdue: 13 },
    { tag_id: 'E', due_date: '2026-12-07', status: 'al_dia' },
];

for (const [mode, tags] of [
    ['semana', ['D', 'B']],
    ['atrasados', ['D']],
    ['sin_historial', ['C']],
    ['proxima', ['A']],
    ['4semanas', ['D', 'B', 'A']],
    ['todo', ['D', 'B', 'A', 'E', 'C']],
]) {
    test(`filterAgenda ${mode} (mismo resultado que maintenance_plan.filter_agenda)`, () => {
        assert.deepEqual(A.filterAgenda(AGENDA, mode, '2026-10-14').map(r => r.tag_id), tags);
    });
}

test('summary separa críticos y sin historial', () => {
    assert.deepEqual(A.summary([
        { status: 'vencido', days_overdue: 45 },
        { status: 'vencido', days_overdue: 3 },
        { status: 'sin_registro' },
        { status: 'proximo' },
    ]), { vencidos: 2, criticos: 1, sinHistorial: 1 });
});

test('statusInfo', () => {
    assert.deepEqual(A.statusInfo({ status: 'vencido', days_overdue: 1 }), { text: '🔴 Vencido hace 1 día', level: 'vencido' });
    assert.deepEqual(A.statusInfo({ status: 'vencido', days_overdue: 30 }),
        { text: '‼️ Vencido hace 30 días · crítico', level: 'critico' });
    assert.equal(A.statusInfo({ status: 'sin_registro' }).level, 'sin_registro');
    assert.equal(A.statusInfo({ status: 'proximo', due_date: '2026-10-16' }).text, '🟠 16/10/2026');
});

test('rescheduleText', () => {
    assert.equal(A.rescheduleText({ reschedule_count: 0 }), '');
    assert.equal(
        A.rescheduleText({ reschedule_count: 2, original_due_date: '2026-12-07', note: 'falta repuesto' }),
        'Reprogramado ×2 · fecha original 07/12/2026 · motivo: falta repuesto');
});

test('delayText mide contra la fecha programada', () => {
    assert.equal(A.delayText('2026-12-07', '2026-12-19'), 'Hecho con 12 días de atraso');
    assert.equal(A.delayText('2026-12-07', '2026-12-08'), 'Hecho con 1 día de atraso');
    assert.equal(A.delayText('2026-12-07', '2026-12-07'), 'A tiempo');
    assert.equal(A.delayText(null, '2026-12-07'), '');
});

test('groupByTag conserva el orden', () => {
    const groups = A.groupByTag([
        { tag_id: 'X', activity_name: '1' }, { tag_id: 'Y', activity_name: '2' }, { tag_id: 'X', activity_name: '3' },
    ]);
    assert.deepEqual(groups.map(g => [g.tag, g.rows.map(r => r.activity_name)]), [['X', ['1', '3']], ['Y', ['2']]]);
});

// ── Formulario: urgencia e incluidas ──
const ACTS = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }, { id: 'a5' }];
const ROWS = [
    { activity_id: 'a1', status: 'vencido', days_overdue: 5, due_date: '2026-11-14', source: 'automatico' },
    { activity_id: 'a2', status: 'proximo', due_date: '2026-11-25', source: 'automatico' },
    { activity_id: 'a3', status: 'sin_registro', due_date: null, source: 'automatico' },
    { activity_id: 'a4', status: 'al_dia', due_date: '2027-02-01', source: 'automatico' },
];

test('groupActivities reparte por urgencia (a5 sin fila = nunca)', () => {
    const g = A.groupActivities(ACTS, ROWS, '2026-11-19');
    assert.deepEqual(g.due.map(x => x.activity.id), ['a1', 'a2']);
    assert.deepEqual(g.never.map(x => x.activity.id), ['a3', 'a5']);
    assert.deepEqual(g.rest.map(x => x.activity.id), ['a4']);
    assert.equal(A.urgencyText(g.due[0], '2026-11-19'), '🔴 Vencida hace 5 días');
    assert.equal(A.urgencyText(g.due[1], '2026-11-19'), '🟠 Vence en 6 días');
});

test('groupActivities: la fila manual manda sobre la automática', () => {
    const rows = [
        { activity_id: 'a4', status: 'proximo', due_date: '2026-11-20', source: 'manual' },
        { activity_id: 'a4', status: 'al_dia', due_date: '2027-02-01', source: 'automatico' },
    ];
    assert.deepEqual(A.groupActivities([{ id: 'a4' }], rows, '2026-11-19').due.map(x => x.activity.id), ['a4']);
});

test('includedBy / expandIncludes: transitivo, sin duplicar lo ya marcado', () => {
    const inc = [
        { activity_id: 'anual', included_id: 'semestral' },
        { activity_id: 'semestral', included_id: 'mensual' },
        { activity_id: 'semestral', included_id: 'trimestral' },
    ];
    assert.deepEqual(A.includedBy(['anual'], inc), { semestral: 'anual', mensual: 'anual', trimestral: 'anual' });
    assert.deepEqual(A.includedBy(['semestral', 'mensual'], inc), { trimestral: 'semestral' });
    assert.deepEqual(A.expandIncludes(['x'], inc), ['x']);
    assert.deepEqual(A.expandIncludes(['semestral'], inc).sort(), ['mensual', 'semestral', 'trimestral']);
});
