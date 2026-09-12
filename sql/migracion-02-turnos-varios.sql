-- ============================================================
-- Migración 02: varias personas por turno
-- Ejecutar en Supabase > SQL Editor. No borra datos existentes.
-- ============================================================

-- Ya se podían guardar varias filas del mismo turno; esto solo evita
-- que la misma persona se duplique en el mismo turno del mismo día.
create unique index if not exists turnos_unicos
  on turnos (dia_id, tipo, persona_id);

-- Los responsables de una misma cocina comparten código, para que
-- cualquiera de ellos pueda marcar los cobros de ese servicio.
update turnos t
   set codigo = (
     select t2.codigo from turnos t2
      where t2.dia_id = t.dia_id and t2.tipo = t.tipo and t2.codigo is not null
      order by t2.id limit 1
   )
 where t.tipo like 'cocina%';
