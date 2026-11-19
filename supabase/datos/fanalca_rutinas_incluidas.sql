-- FANALCA: rutinas que incluyen otras (registrar la mayor reinicia también las menores).
-- Idempotente. Pares (mayor → incluida) por nombre dentro de cada tipo de equipo.
insert into public.maintenance_activity_includes (activity_id, included_id)
select p.id, c.id
from (values
  ('Difusor ciclónico (aireación)', 'Sacar la parrilla de difusores%', 'Verificar uniformidad del burbujeo%'),
  ('Difusor ciclónico (aireación)', 'Sacar la parrilla de difusores%', 'Revisar fugas o desgaste en conexiones%'),
  ('Difusor ciclónico (aireación)', 'Inspeccionar anclajes de la parrilla%', 'Sacar la parrilla de difusores%'),
  ('Bomba centrífuga sumergible', 'Cambio de rodamientos%', 'Limpieza general de la bomba'),
  ('Bomba centrífuga sumergible', 'Cambio de rodamientos%', 'Revisar sello mecánico%'),
  ('Bomba centrífuga sumergible', 'Revisar sello mecánico%', 'Limpieza general de la bomba'),
  ('Bomba neumática de diafragma', 'Inspección de diafragmas%', 'Inspección de cheques'),
  ('Reactor MBBR', 'Lavado general del tanque', 'Inspección estructural del tanque%'),
  ('Reactor MBBR', 'Lavado general del tanque', 'Limpieza del compartimiento de separación%'),
  ('Compresor de pistón', 'Revisar válvulas de admisión%', 'Limpieza del filtro de aire de aspiración%')
) as v(clase, mayor, menor)
join public.equipment_classes k on k.name = v.clase
join public.maintenance_activities p on p.class_id = k.id and p.name like v.mayor
join public.maintenance_activities c on c.class_id = k.id and c.name like v.menor
on conflict do nothing;
