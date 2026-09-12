-- ============================================================
-- La Paya - esquema de base de datos (Supabase / Postgres)
-- Ejecutar entero en: Dashboard > SQL Editor > New query > Run
-- ============================================================

-- Limpieza (por si re-ejecutas)
drop table if exists apuntes cascade;
drop table if exists tareas cascade;
drop table if exists turnos cascade;
drop table if exists pagos cascade;
drop table if exists gastos cascade;
drop table if exists dias cascade;
drop table if exists personas cascade;
drop table if exists config cascade;

-- ------------------------------------------------------------
-- PERSONAS
-- tipo 'socio'    -> paga comidas + parte de gastos generales
-- tipo 'invitado' -> paga SOLO comidas/cenas, nunca gastos generales
-- peso            -> reparto de gastos generales (1 = parte igual)
-- socio_id        -> socio que trae al invitado
-- ------------------------------------------------------------
create table personas (
  id         bigserial primary key,
  nombre     text    not null,
  tipo       text    not null default 'socio' check (tipo in ('socio','invitado')),
  socio_id   bigint  references personas(id) on delete set null,
  peso       numeric(6,2) not null default 1,
  activo     boolean not null default true,
  creado_en  timestamptz default now()
);

-- ------------------------------------------------------------
-- DIAS de fiesta, con menus y los 6 precios posibles
-- ------------------------------------------------------------
create table dias (
  id                bigserial primary key,
  fecha             date not null unique,
  hay_comida        boolean not null default true,
  hay_cena          boolean not null default true,
  menu_comida       text,
  menu_cena         text,
  -- precios comida
  p_comida          numeric(8,2) not null default 0,  -- solo comer
  p_comida_sob      numeric(8,2) not null default 0,  -- comida + sobremesa
  p_sob_comida      numeric(8,2) not null default 0,  -- solo sobremesa
  -- precios cena
  p_cena            numeric(8,2) not null default 0,
  p_cena_sob        numeric(8,2) not null default 0,
  p_sob_cena        numeric(8,2) not null default 0,
  notas             text
);

-- ------------------------------------------------------------
-- APUNTES: quien come/cena cada dia y en que modalidad
-- ------------------------------------------------------------
create table apuntes (
  id          bigserial primary key,
  persona_id  bigint not null references personas(id) on delete cascade,
  dia_id      bigint not null references dias(id) on delete cascade,
  servicio    text   not null check (servicio in ('comida','cena')),
  modalidad   text   not null check (modalidad in ('completo','con_sobremesa','solo_sobremesa')),
  pagado      boolean not null default false,
  unique (persona_id, dia_id, servicio)
);
create index on apuntes (dia_id);
create index on apuntes (persona_id);

-- ------------------------------------------------------------
-- TURNOS. codigo = palabra que permite al responsable marcar cobros
-- ------------------------------------------------------------
create table turnos (
  id          bigserial primary key,
  dia_id      bigint not null references dias(id) on delete cascade,
  tipo        text   not null check (tipo in ('limpieza','cocina_comida','cocina_cena')),
  persona_id  bigint references personas(id) on delete set null,
  codigo      text,
  notas       text
);
create index on turnos (dia_id);
-- Varias personas por turno, pero cada una una sola vez
create unique index turnos_unicos on turnos (dia_id, tipo, persona_id);

-- ------------------------------------------------------------
-- TAREAS de peña: montaje (antes de fiestas) y recogida (después).
-- Van por grupo de personas, no por día.
-- ------------------------------------------------------------
create table tareas (
  id          bigserial primary key,
  tipo        text   not null check (tipo in ('montaje','recogida')),
  persona_id  bigint not null references personas(id) on delete cascade,
  unique (tipo, persona_id)
);

-- ------------------------------------------------------------
-- GASTOS GENERALES (los reparten los socios segun peso)
-- ------------------------------------------------------------
create table gastos (
  id             bigserial primary key,
  concepto       text not null,
  importe        numeric(10,2) not null default 0,
  fecha          date not null default current_date,
  responsable_id bigint references personas(id) on delete set null
);

-- ------------------------------------------------------------
-- PAGOS a cuenta de los gastos generales
-- ------------------------------------------------------------
create table pagos (
  id          bigserial primary key,
  persona_id  bigint not null references personas(id) on delete cascade,
  importe     numeric(10,2) not null,
  fecha       date not null default current_date,
  nota        text
);
create index on pagos (persona_id);

-- ------------------------------------------------------------
-- CONFIG: pares clave/valor (codigo tesorero, nombre de la peña...)
-- ------------------------------------------------------------
create table config (
  clave text primary key,
  valor text
);

insert into config (clave, valor) values
  ('codigo_tesorero', 'melon'),
  ('fecha_montaje',   ''),
  ('fecha_recogida',  ''),
  ('nombre_peña',     'Peña La Paya'),
  ('año',             '2026');

-- ============================================================
-- ROW LEVEL SECURITY
--   anon          -> puede LEER todo
--                 -> puede marcar cobros (apuntes.pagado) e insertar pagos
--   authenticated -> admin, puede todo
-- ============================================================
alter table personas enable row level security;
alter table dias     enable row level security;
alter table apuntes  enable row level security;
alter table turnos   enable row level security;
alter table tareas   enable row level security;
alter table gastos   enable row level security;
alter table pagos    enable row level security;
alter table config   enable row level security;

-- Lectura publica en todas las tablas
create policy "lectura publica" on personas for select using (true);
create policy "lectura publica" on dias     for select using (true);
create policy "lectura publica" on apuntes  for select using (true);
create policy "lectura publica" on turnos   for select using (true);
create policy "lectura publica" on tareas   for select using (true);
create policy "lectura publica" on gastos   for select using (true);
create policy "lectura publica" on pagos    for select using (true);
create policy "lectura publica" on config   for select using (true);

-- Escritura total para el admin autenticado
create policy "admin total" on personas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin total" on dias     for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin total" on apuntes  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin total" on turnos   for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin total" on tareas   for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin total" on gastos   for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin total" on pagos    for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin total" on config   for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Responsables (con codigo) marcan cobros sin estar autenticados.
-- Solo pueden tocar la columna 'pagado' de apuntes, e insertar/borrar pagos.
create policy "responsable marca cobro" on apuntes for update using (true) with check (true);
create policy "responsable anota pago"  on pagos   for insert with check (true);
create policy "responsable borra pago"  on pagos   for delete using (true);

revoke update on apuntes from anon;
grant  update (pagado) on apuntes to anon;
grant  insert, delete on pagos to anon;
grant  usage, select on sequence pagos_id_seq to anon;

-- ============================================================
-- DIAS DE ESTE AÑO: 18 -> 27 de septiembre de 2026
-- (cambia las fechas si hace falta)
-- ============================================================
insert into dias (fecha, hay_comida, hay_cena)
select d::date, true, true
from generate_series('2026-09-18'::date, '2026-09-27'::date, '1 day') d;
