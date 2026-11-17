-- Rutinas de mantenimiento de FANALCA (PTAR STARD) por tipo de equipo.
-- Fuente: FANPH2-ZB2-NP00043-MP-02 (programa preventivo). Solo frecuencias
-- mensuales o mayores; máximo 5 rutinas por tipo de equipo.
-- 100-C-01 (compresor de pistón) y 400-MX-01 (difusor ciclónico) no están en
-- el MP-02: rutinas armadas con práctica estándar de fabricantes (2026-11-17).
--
-- Frecuencias en semanas: M=4, BM=8, TM=13, SM=26, A=52. Por ahora son de
-- referencia (el calendario se define después).
--
-- Idempotente: se puede volver a correr; actualiza nombres y frecuencias.
-- Aplicar: supabase db query --linked -f supabase/datos/fanalca_rutinas.sql
--          (o pegar en el SQL Editor del proyecto).

begin;

-- ── Tipos de equipo ─────────────────────────────────────────────────────
insert into public.equipment_classes (code, name, hours_per_day) values
  ('BOMBA_SUMERGIBLE',  'Bomba centrífuga sumergible',  12),
  ('SOPLADOR_REGEN',    'Soplador regenerativo',        24),
  ('BOMBA_NEUMATICA',   'Bomba neumática de diafragma',  4),
  ('FILTRO_PRENSA',     'Filtro prensa',                 8),
  ('REACTOR_MBBR',      'Reactor MBBR',                 24),
  ('TANQUE',            'Tanque / foso',                24),
  ('DIFUSOR_CICLONICO', 'Difusor ciclónico (aireación)',24),
  ('COMPRESOR_PISTON',  'Compresor de pistón',           8)
on conflict (code) do update set name = excluded.name;

-- ── Rutinas (máx. 5 por tipo) ───────────────────────────────────────────
with r(class_code, code, name, weeks) as (values
  -- Bomba centrífuga sumergible (MP-02 §2)
  ('BOMBA_SUMERGIBLE', 'CORRIENTE',   'Revisión de corriente eléctrica (no sobrepasar corriente de placa)', 4),
  ('BOMBA_SUMERGIBLE', 'LIMPIEZA',    'Limpieza general de la bomba', 4),
  ('BOMBA_SUMERGIBLE', 'CONEX-ELEC',  'Revisar y apretar tornillos de conexiones eléctricas', 13),
  ('BOMBA_SUMERGIBLE', 'SELLO',       'Revisar sello mecánico y empaques; cambiar si es necesario', 26),
  ('BOMBA_SUMERGIBLE', 'RODAMIENTOS', 'Cambio de rodamientos según manual del fabricante', 26),
  -- Soplador regenerativo (MP-02 §6)
  ('SOPLADOR_REGEN', 'LUBRICACION', 'Lubricar rodamientos con grasa de litio NLGI 2', 4),
  ('SOPLADOR_REGEN', 'CORRIENTE',   'Revisión de corriente eléctrica (no sobrepasar corriente de placa)', 4),
  ('SOPLADOR_REGEN', 'ALIVIO',      'Inspección de válvula de alivio: presión, resorte y tornillos', 4),
  ('SOPLADOR_REGEN', 'FILTRO-AIRE', 'Cambio del filtro de aire', 26),
  ('SOPLADOR_REGEN', 'SILENCIADOR', 'Cambio de esponja y malla del silenciador (entrada y salida)', 52),
  -- Bomba neumática de diafragma (MP-02 §7)
  ('BOMBA_NEUMATICA', 'FILTRO-AIRE', 'Limpieza del cartucho del filtro de aire; cambiar si es necesario', 4),
  ('BOMBA_NEUMATICA', 'TUB-AIRE',    'Inspección de tuberías de aire', 4),
  ('BOMBA_NEUMATICA', 'ENGRASE',     'Engrasar pilot spool, válvula de aire y eje principal (grasa siliconada)', 26),
  ('BOMBA_NEUMATICA', 'DIAFRAGMAS',  'Inspección de diafragmas y O-ring', 26),
  ('BOMBA_NEUMATICA', 'CHEQUES',     'Inspección de cheques', 26),
  -- Filtro prensa (MP-02 §8)
  ('FILTRO_PRENSA', 'PRESIONES',   'Verificación de bomba de alimentación y presiones de operación', 4),
  ('FILTRO_PRENSA', 'HIDRAULICO',  'Inspección del sistema hidráulico (cilindros, mangueras, presión)', 13),
  ('FILTRO_PRENSA', 'CIERRE',      'Revisión de estructura y sistema de cierre/apriete de placas', 13),
  ('FILTRO_PRENSA', 'LUBRICACION', 'Lubricación de partes móviles y mecanismos de desplazamiento', 13),
  ('FILTRO_PRENSA', 'RENDIMIENTO', 'Evaluación del rendimiento de deshidratación y % de sólidos', 52),
  -- Reactor MBBR (MP-02 §4)
  ('REACTOR_MBBR', 'FUGAS',       'Revisar fugas en las líneas', 4),
  ('REACTOR_MBBR', 'ESTRUCTURA',  'Inspección estructural del tanque (agrietamiento y fugas)', 4),
  ('REACTOR_MBBR', 'DESC-LODOS',  'Inspección del sistema de descarga de lodos: válvulas, tuberías y bombas', 13),
  ('REACTOR_MBBR', 'LIMPIEZA-SL', 'Limpieza del compartimiento de separación S-L (canaletas, deflectores)', 13),
  ('REACTOR_MBBR', 'LAVADO',      'Lavado general del tanque', 52),
  -- Tanque / foso (MP-02 §3)
  ('TANQUE', 'LAVADO',     'Lavado general del tanque', 4),
  ('TANQUE', 'ESTRUCTURA', 'Inspección estructural del tanque (agrietamiento y fugas)', 13),
  ('TANQUE', 'PINTURA',    'Inspección de pintura y retoque si es necesario', 13),
  -- Difusor ciclónico 400-MX-01 (MP-02 §5 difusores + práctica de fabricante)
  ('DIFUSOR_CICLONICO', 'BURBUJEO',   'Verificar uniformidad del burbujeo y mezcla (sin zonas muertas)', 4),
  ('DIFUSOR_CICLONICO', 'PRESION',    'Verificar presión y caudal de aire en la línea de aireación', 4),
  ('DIFUSOR_CICLONICO', 'FUGAS-AIRE', 'Revisar fugas o desgaste en conexiones, válvulas y líneas de aire', 13),
  ('DIFUSOR_CICLONICO', 'LIMPIEZA',   'Sacar la parrilla de difusores y limpiar (lavado a presión; si hay incrustación, limpieza ácida suave)', 26),
  ('DIFUSOR_CICLONICO', 'FIJACION',   'Inspeccionar anclajes de la parrilla y estado de los difusores (grietas, deformación); cambiar los dañados', 52),
  -- Compresor de pistón 100-C-01 (práctica estándar de fabricante)
  ('COMPRESOR_PISTON', 'FILTRO-ASP', 'Limpieza del filtro de aire de aspiración; cambiar si está saturado', 4),
  ('COMPRESOR_PISTON', 'CORREAS',    'Revisar tensión y estado de correas y guarda', 4),
  ('COMPRESOR_PISTON', 'ACEITE',     'Cambio de aceite del cárter (o cada 500 h de trabajo)', 13),
  ('COMPRESOR_PISTON', 'SEGURIDAD',  'Probar válvula de seguridad y presostato (presiones de arranque y parada)', 13),
  ('COMPRESOR_PISTON', 'CABEZAL',    'Revisar válvulas de admisión/descarga, limpiar carbonilla y reapretar culata', 52)
)
insert into public.maintenance_activities (class_id, code, name, interval_weeks)
select c.id, r.code, r.name, r.weeks
from r join public.equipment_classes c on c.code = r.class_code
on conflict (class_id, code) do update
  set name = excluded.name, interval_weeks = excluded.interval_weeks, active = true;

-- ── TAG → tipo de equipo ────────────────────────────────────────────────
-- Pares A/B: mismo group_key, pero cada TAG lleva su propio historial.
-- Régimen 'normal' por ahora; titular/respaldo se define con el calendario.
with t(tag_id, class_code, group_key) as (values
  ('100-P-01A', 'BOMBA_SUMERGIBLE', '100-P-01'),
  ('100-P-01B', 'BOMBA_SUMERGIBLE', '100-P-01'),
  ('600-P-01',  'BOMBA_SUMERGIBLE', null),
  ('400-C-01A', 'SOPLADOR_REGEN',   '400-C-01'),
  ('400-C-01B', 'SOPLADOR_REGEN',   '400-C-01'),
  ('600-P-02',  'BOMBA_NEUMATICA',  null),
  ('803-P-01',  'BOMBA_NEUMATICA',  null),
  ('600-SD-01', 'FILTRO_PRENSA',    null),
  ('400-R-01',  'REACTOR_MBBR',     null),
  ('500-TK-01', 'TANQUE',           null),
  ('600-TK-01', 'TANQUE',           null),
  ('600-TK-02', 'TANQUE',           null),
  ('803-TK-01', 'TANQUE',           null),
  ('400-MX-01', 'DIFUSOR_CICLONICO', null),
  ('100-C-01',  'COMPRESOR_PISTON', null)
)
insert into public.equipment_tags (tag_id, class_id, group_key)
select t.tag_id, c.id, t.group_key
from t join public.equipment_classes c on c.code = t.class_code
on conflict (tag_id) do update
  set class_id = excluded.class_id, group_key = excluded.group_key;

commit;
