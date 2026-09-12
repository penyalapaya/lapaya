-- ============================================================
-- Migración 01: montaje y recogida dejan de ir por días
-- Ejecutar en Supabase > SQL Editor. No borra datos existentes.
-- ============================================================

-- Tareas de peña: un grupo de personas para el montaje (antes de fiestas)
-- y otro para la recogida (después). Sin día asociado.
create table if not exists tareas (
  id          bigserial primary key,
  tipo        text   not null check (tipo in ('montaje','recogida')),
  persona_id  bigint not null references personas(id) on delete cascade,
  unique (tipo, persona_id)
);

alter table tareas enable row level security;

drop policy if exists "lectura publica" on tareas;
drop policy if exists "admin total"    on tareas;
create policy "lectura publica" on tareas for select using (true);
create policy "admin total"     on tareas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Los turnos por día se quedan solo con limpieza y cocina
delete from turnos where tipo in ('montaje','recogida');

alter table turnos drop constraint if exists turnos_tipo_check;
alter table turnos add  constraint turnos_tipo_check
  check (tipo in ('limpieza','cocina_comida','cocina_cena'));

-- Fechas orientativas de montaje y recogida
insert into config (clave, valor) values
  ('fecha_montaje',  ''),
  ('fecha_recogida', '')
on conflict (clave) do nothing;
