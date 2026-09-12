// ============================================================
// Núcleo compartido: conexión, carga de datos y cálculos
// ============================================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Datos en memoria
const DB = {
  personas: [], dias: [], apuntes: [], turnos: [],
  gastos: [], pagos: [], config: {}
};

const MODALIDADES = {
  completo:       'Solo comer',
  con_sobremesa:  'Con sobremesa',
  solo_sobremesa: 'Solo sobremesa'
};
const TIPOS_TURNO = {
  montaje:      'Montaje / llevar trastos',
  recogida:     'Recogida de trastos',
  limpieza:     'Limpieza',
  cocina_comida:'Cocina · comida',
  cocina_cena:  'Cocina · cena'
};

// ---------- utilidades ----------
const eur = n => (Number(n) || 0).toLocaleString('es-ES', {style:'currency', currency:'EUR'});

function fechaLarga(iso){
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'});
}
function fechaCorta(iso){
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-ES', {weekday:'short', day:'numeric', month:'short'});
}
function hoyISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function aviso(contenedor, texto, tipo='ok'){
  const el = typeof contenedor === 'string' ? $(contenedor) : contenedor;
  if (!el) return;
  el.innerHTML = `<div class="aviso ${tipo}">${esc(texto)}</div>`;
  if (tipo === 'ok') setTimeout(() => { el.innerHTML = ''; }, 4000);
}

// ---------- carga ----------
async function cargarTodo(){
  const [personas, dias, apuntes, turnos, gastos, pagos, config] = await Promise.all([
    sb.from('personas').select('*').order('nombre'),
    sb.from('dias').select('*').order('fecha'),
    sb.from('apuntes').select('*'),
    sb.from('turnos').select('*'),
    sb.from('gastos').select('*').order('fecha'),
    sb.from('pagos').select('*').order('fecha'),
    sb.from('config').select('*')
  ]);

  const fallo = [personas, dias, apuntes, turnos, gastos, pagos, config].find(r => r.error);
  if (fallo) throw new Error(fallo.error.message);

  DB.personas = personas.data;
  DB.dias     = dias.data;
  DB.apuntes  = apuntes.data;
  DB.turnos   = turnos.data;
  DB.gastos   = gastos.data;
  DB.pagos    = pagos.data;
  DB.config   = Object.fromEntries(config.data.map(c => [c.clave, c.valor]));
}

// ---------- accesos rápidos ----------
const persona   = id => DB.personas.find(p => p.id === id);
const dia       = id => DB.dias.find(d => d.id === id);
const diaPorFecha = f => DB.dias.find(d => d.fecha === f);
const socios    = () => DB.personas.filter(p => p.tipo === 'socio'    && p.activo);
const invitados = () => DB.personas.filter(p => p.tipo === 'invitado' && p.activo);
const activos   = () => DB.personas.filter(p => p.activo);

function apuntesDe(dia_id, servicio){
  return DB.apuntes.filter(a => a.dia_id === dia_id && a.servicio === servicio);
}
function turnosDe(dia_id){
  return DB.turnos.filter(t => t.dia_id === dia_id);
}

// Precio de un apunte según el día, servicio y modalidad
function precioApunte(a){
  const d = dia(a.dia_id);
  if (!d) return 0;
  const tabla = a.servicio === 'comida'
    ? {completo:d.p_comida, con_sobremesa:d.p_comida_sob, solo_sobremesa:d.p_sob_comida}
    : {completo:d.p_cena,   con_sobremesa:d.p_cena_sob,   solo_sobremesa:d.p_sob_cena};
  return Number(tabla[a.modalidad]) || 0;
}

// ---------- cálculo de cuentas ----------
// Devuelve un objeto por persona con consumo, cuota de generales, pagado y deuda.
function calcularCuentas(){
  const totalGastos = DB.gastos.reduce((s, g) => s + Number(g.importe), 0);
  const pesoTotal   = socios().reduce((s, p) => s + Number(p.peso), 0) || 1;

  return DB.personas.map(p => {
    const mios = DB.apuntes.filter(a => a.persona_id === p.id);

    const consumo        = mios.reduce((s, a) => s + precioApunte(a), 0);
    const consumoPagado  = mios.filter(a => a.pagado).reduce((s, a) => s + precioApunte(a), 0);

    const cuotaGenerales   = p.tipo === 'socio' && p.activo
      ? totalGastos * Number(p.peso) / pesoTotal
      : 0;
    const generalesPagados = DB.pagos
      .filter(g => g.persona_id === p.id)
      .reduce((s, g) => s + Number(g.importe), 0);

    return {
      persona: p,
      consumo, consumoPagado,
      consumoDebe: consumo - consumoPagado,
      cuotaGenerales, generalesPagados,
      generalesDebe: cuotaGenerales - generalesPagados,
      total: consumo + cuotaGenerales,
      pagado: consumoPagado + generalesPagados,
      debe: (consumo + cuotaGenerales) - (consumoPagado + generalesPagados),
      nComidas: mios.length
    };
  });
}
