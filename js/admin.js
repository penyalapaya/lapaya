// ============================================================
// Pantalla de administración
// ============================================================

let iDiaAp = 0;   // día mostrado en "Apuntar comidas"

document.addEventListener('DOMContentLoaded', () => {
  $('#btnEntrar').addEventListener('click', entrar);
  $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
  $('#btnSalir').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

  if (SUPABASE_KEY === 'PEGA_AQUI_TU_CLAVE_PUBLICA'){
    aviso('#avisoLogin', 'Falta configurar la clave de Supabase en js/config.js', 'err');
    return;
  }
  // si ya había sesión abierta, entrar directo
  sb.auth.getSession().then(({data}) => { if (data.session) abrirPanel(); });
});

async function entrar(){
  const pin = $('#pin').value.trim();
  if (!pin) return;
  $('#btnEntrar').disabled = true;
  const {error} = await sb.auth.signInWithPassword({email: ADMIN_EMAIL, password: pin});
  $('#btnEntrar').disabled = false;
  if (error) return aviso('#avisoLogin', 'PIN incorrecto.', 'err');
  abrirPanel();
}

async function abrirPanel(){
  $('#login').style.display = 'none';
  $('#panel').style.display = '';
  $('#btnSalir').style.display = '';

  $$('nav.tabs button').forEach(b => b.addEventListener('click', () => {
    $$('nav.tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('section.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + b.dataset.tab));
  }));
  $('#nTipo').addEventListener('change', () => {
    $('#cajaSocio').style.display = $('#nTipo').value === 'invitado' ? '' : 'none';
  });
  $('#btnAddPersona').addEventListener('click', addPersona);
  $('#btnGenDias').addEventListener('click', generarDias);
  $('#btnAddGasto').addEventListener('click', addGasto);
  $('#btnGuardarConfig').addEventListener('click', guardarConfig);
  $('#apAnt').addEventListener('click', () => { iDiaAp = Math.max(0, iDiaAp - 1); pintarApuntes(); });
  $('#apSig').addEventListener('click', () => { iDiaAp = Math.min(DB.dias.length - 1, iDiaAp + 1); pintarApuntes(); });

  try { await cargarTodo(); } catch(e){ return aviso('#estado', 'Error al cargar: ' + e.message, 'err'); }

  const hoy = hoyISO();
  iDiaAp = DB.dias.findIndex(d => d.fecha >= hoy);
  if (iDiaAp < 0) iDiaAp = Math.max(0, DB.dias.length - 1);

  pintarTodo();
}

function pintarTodo(){
  pintarPersonas(); pintarDias(); pintarApuntes();
  pintarTurnosAdmin(); pintarGastos(); pintarConfig();
}

async function recargar(){ await cargarTodo(); pintarTodo(); }

// ============================================================
// PERSONAS
// ============================================================
async function addPersona(){
  const nombre = $('#nNombre').value.trim();
  if (!nombre) return aviso('#estado', 'Escribe un nombre.', 'err');
  const tipo = $('#nTipo').value;
  const fila = {nombre, tipo, peso: 1, activo: true};
  if (tipo === 'invitado') fila.socio_id = Number($('#nSocio').value) || null;

  const {error} = await sb.from('personas').insert(fila);
  if (error) return aviso('#estado', error.message, 'err');
  $('#nNombre').value = '';
  await recargar();
}

function pintarPersonas(){
  // selector "invitado de"
  $('#nSocio').innerHTML = '<option value="">—</option>' +
    socios().map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  $('#gResp').innerHTML = '<option value="">—</option>' +
    DB.personas.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');

  $('#tablaSocios').innerHTML = tablaPersonas(DB.personas.filter(p => p.tipo === 'socio'), false);
  $('#tablaInvitados').innerHTML = tablaPersonas(DB.personas.filter(p => p.tipo === 'invitado'), true);
}

function tablaPersonas(lista, esInvitado){
  if (!lista.length) return '<p class="vacio">Todavía no hay nadie.</p>';
  let html = `<div class="tabla-wrap"><table><thead><tr><th>Nombre</th>
    ${esInvitado ? '<th>Invitado de</th>' : '<th class="num">Peso</th>'}
    <th>Activo</th><th></th></tr></thead><tbody>`;
  for (const p of lista){
    html += `<tr>
      <td><input value="${esc(p.nombre)}" style="width:100%"
            onchange="editarPersona(${p.id}, 'nombre', this.value)"></td>`;
    if (esInvitado){
      html += `<td><select onchange="editarPersona(${p.id}, 'socio_id', this.value ? Number(this.value) : null)">
        <option value="">—</option>
        ${socios().map(s => `<option value="${s.id}" ${s.id === p.socio_id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}
      </select></td>`;
    } else {
      html += `<td class="num"><input type="number" step="0.1" value="${p.peso}" style="width:70px"
            onchange="editarPersona(${p.id}, 'peso', Number(this.value))"></td>`;
    }
    html += `<td><input type="checkbox" ${p.activo ? 'checked' : ''}
              onchange="editarPersona(${p.id}, 'activo', this.checked)"></td>
      <td><button class="mini peligro" onclick="borrarPersona(${p.id}, '${esc(p.nombre).replace(/'/g,"\\'")}')">Borrar</button></td></tr>`;
  }
  return html + '</tbody></table></div>';
}

async function editarPersona(id, campo, valor){
  const {error} = await sb.from('personas').update({[campo]: valor}).eq('id', id);
  if (error) return aviso('#estado', error.message, 'err');
  await recargar();
}

async function borrarPersona(id, nombre){
  if (!confirm(`¿Borrar a ${nombre}? Se borrarán también sus comidas, turnos y pagos.`)) return;
  const {error} = await sb.from('personas').delete().eq('id', id);
  if (error) return aviso('#estado', error.message, 'err');
  await recargar();
}

// ============================================================
// DÍAS Y PRECIOS
// ============================================================
async function generarDias(){
  const ini = $('#fIni').value, fin = $('#fFin').value;
  if (!ini || !fin || ini > fin) return aviso('#estado', 'Revisa las fechas.', 'err');

  const nuevos = [];
  for (let d = new Date(ini + 'T12:00:00'); d <= new Date(fin + 'T12:00:00'); d.setDate(d.getDate() + 1)){
    const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!diaPorFecha(iso)) nuevos.push({fecha: iso});
  }
  if (!nuevos.length) return aviso('#estado', 'Esos días ya existen.', 'ok');

  const {error} = await sb.from('dias').insert(nuevos);
  if (error) return aviso('#estado', error.message, 'err');
  aviso('#estado', `${nuevos.length} días creados.`, 'ok');
  await recargar();
}

function pintarDias(){
  if (!DB.dias.length){ $('#listaDias').innerHTML = '<p class="vacio">Sin días. Créalos arriba.</p>'; return; }
  let html = '';
  for (const d of DB.dias){
    html += `<div class="panel">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h2 style="margin:0;text-transform:capitalize">${esc(fechaLarga(d.fecha))}</h2>
        <button class="mini peligro" style="margin-left:auto" onclick="borrarDia(${d.id})">Borrar día</button>
      </div>

      <h3><label style="display:inline;font-size:.95rem">
        <input type="checkbox" ${d.hay_comida ? 'checked' : ''} onchange="editarDia(${d.id},'hay_comida',this.checked)">
        Hay comida</label></h3>
      <div class="fila">
        <div style="flex:2 1 260px"><label>Menú</label>
          <input style="width:100%" value="${esc(d.menu_comida || '')}" onchange="editarDia(${d.id},'menu_comida',this.value)"></div>
        <div><label>Solo comer €</label><input type="number" step="0.01" value="${d.p_comida}" onchange="editarDia(${d.id},'p_comida',Number(this.value))"></div>
        <div><label>Con sobremesa €</label><input type="number" step="0.01" value="${d.p_comida_sob}" onchange="editarDia(${d.id},'p_comida_sob',Number(this.value))"></div>
        <div><label>Solo sobremesa €</label><input type="number" step="0.01" value="${d.p_sob_comida}" onchange="editarDia(${d.id},'p_sob_comida',Number(this.value))"></div>
      </div>

      <h3><label style="display:inline;font-size:.95rem">
        <input type="checkbox" ${d.hay_cena ? 'checked' : ''} onchange="editarDia(${d.id},'hay_cena',this.checked)">
        Hay cena</label></h3>
      <div class="fila">
        <div style="flex:2 1 260px"><label>Menú</label>
          <input style="width:100%" value="${esc(d.menu_cena || '')}" onchange="editarDia(${d.id},'menu_cena',this.value)"></div>
        <div><label>Solo cenar €</label><input type="number" step="0.01" value="${d.p_cena}" onchange="editarDia(${d.id},'p_cena',Number(this.value))"></div>
        <div><label>Con sobremesa €</label><input type="number" step="0.01" value="${d.p_cena_sob}" onchange="editarDia(${d.id},'p_cena_sob',Number(this.value))"></div>
        <div><label>Solo sobremesa €</label><input type="number" step="0.01" value="${d.p_sob_cena}" onchange="editarDia(${d.id},'p_sob_cena',Number(this.value))"></div>
      </div>
    </div>`;
  }
  $('#listaDias').innerHTML = html;
}

async function editarDia(id, campo, valor){
  const {error} = await sb.from('dias').update({[campo]: valor}).eq('id', id);
  if (error) return aviso('#estado', error.message, 'err');
  const d = dia(id); if (d) d[campo] = valor;
  pintarApuntes();
}

async function borrarDia(id){
  if (!confirm('¿Borrar este día con todos sus apuntes y turnos?')) return;
  const {error} = await sb.from('dias').delete().eq('id', id);
  if (error) return aviso('#estado', error.message, 'err');
  iDiaAp = 0;
  await recargar();
}

// ============================================================
// APUNTAR COMIDAS
// ============================================================
function pintarApuntes(){
  const d = DB.dias[iDiaAp];
  if (!d){ $('#apFecha').textContent = '—'; $('#matrizApuntes').innerHTML = '<p class="vacio">Sin días.</p>'; return; }
  $('#apFecha').textContent = fechaLarga(d.fecha);

  let html = '';
  for (const servicio of ['comida','cena']){
    const activo = servicio === 'comida' ? d.hay_comida : d.hay_cena;
    if (!activo) continue;

    const lista  = apuntesDe(d.id, servicio);
    const conSob = lista.filter(a => a.modalidad !== 'completo').length;

    html += `<div class="panel">
      <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
        <h2 style="margin:0">${servicio === 'comida' ? 'Comida' : 'Cena'}</h2>
        <span style="color:var(--suave);font-size:.85rem">${lista.length} apuntados · ${conSob} se quedan a la sobremesa</span>
      </div>

      <div class="fila" style="margin:12px 0 4px">
        <div style="flex:0 0 auto"><button class="mini" onclick="apuntarTodos(${d.id},'${servicio}','con_sobremesa')">Todos con sobremesa</button></div>
        <div style="flex:0 0 auto"><button class="mini sec" onclick="apuntarTodos(${d.id},'${servicio}','completo')">Todos ${servicio === 'comida' ? 'solo comer' : 'solo cenar'}</button></div>
        <div style="flex:0 0 auto"><button class="mini sec" onclick="vaciarServicio(${d.id},'${servicio}')">Vaciar</button></div>
      </div>

      <div class="tabla-wrap"><table><thead><tr>
        <th>Persona</th><th>Apuntado</th><th class="num">Precio</th></tr></thead><tbody>`;

    for (const p of activos()){
      const a = DB.apuntes.find(x => x.persona_id === p.id && x.dia_id === d.id && x.servicio === servicio);
      const m = a ? a.modalidad : '';
      html += `<tr>
        <td>${esc(p.nombre)} ${p.tipo === 'invitado' ? '<span class="pill inv">inv.</span>' : ''}</td>
        <td><button class="mod ${claseModalidad(m)}"
              onclick="rotarApunte(${p.id}, ${d.id}, '${servicio}')">${esc(etiquetaModalidad(servicio, m))}</button></td>
        <td class="num">${a ? eur(precioApunte(a)) : '—'}</td>
      </tr>`;
    }

    html += `</tbody><tfoot><tr class="total"><td>${lista.length} personas</td><td></td>
      <td class="num">${eur(lista.reduce((s, a) => s + precioApunte(a), 0))}</td></tr></tfoot></table></div></div>`;
  }
  if (!html) html = '<p class="vacio">Este día no tiene ni comida ni cena activadas.</p>';
  $('#matrizApuntes').innerHTML = html;
}

// Ciclo del botón rotativo: no viene -> solo comer -> con sobremesa -> solo sobremesa -> no viene
const CICLO = ['', 'completo', 'con_sobremesa', 'solo_sobremesa'];

function etiquetaModalidad(servicio, m){
  if (!m) return 'No viene';
  if (m === 'completo')       return servicio === 'comida' ? 'Solo comer' : 'Solo cenar';
  if (m === 'con_sobremesa')  return 'Con sobremesa';
  return 'Solo sobremesa';
}
function claseModalidad(m){
  return {'': 'm-no', completo: 'm-completo', con_sobremesa: 'm-sob', solo_sobremesa: 'm-solosob'}[m];
}

function rotarApunte(persona_id, dia_id, servicio){
  const a = DB.apuntes.find(x => x.persona_id === persona_id && x.dia_id === dia_id && x.servicio === servicio);
  const actual = a ? a.modalidad : '';
  const siguiente = CICLO[(CICLO.indexOf(actual) + 1) % CICLO.length];
  return ponerApunte(persona_id, dia_id, servicio, siguiente);
}

async function ponerApunte(persona_id, dia_id, servicio, modalidad){
  if (!modalidad){
    const {error} = await sb.from('apuntes').delete()
      .eq('persona_id', persona_id).eq('dia_id', dia_id).eq('servicio', servicio);
    if (error) return aviso('#avisoApuntes', error.message, 'err');
    DB.apuntes = DB.apuntes.filter(x =>
      !(x.persona_id === persona_id && x.dia_id === dia_id && x.servicio === servicio));
  } else {
    const {data, error} = await sb.from('apuntes')
      .upsert({persona_id, dia_id, servicio, modalidad}, {onConflict: 'persona_id,dia_id,servicio'})
      .select();
    if (error) return aviso('#avisoApuntes', error.message, 'err');
    const i = DB.apuntes.findIndex(x =>
      x.persona_id === persona_id && x.dia_id === dia_id && x.servicio === servicio);
    if (i >= 0) DB.apuntes[i] = data[0]; else DB.apuntes.push(data[0]);
  }
  pintarApuntes();
}

// Apunta de golpe a todas las personas activas que aún no estén en esa modalidad
async function apuntarTodos(dia_id, servicio, modalidad){
  const filas = activos()
    .filter(p => {
      const a = DB.apuntes.find(x => x.persona_id === p.id && x.dia_id === dia_id && x.servicio === servicio);
      return !a || a.modalidad !== modalidad;
    })
    .map(p => ({persona_id: p.id, dia_id, servicio, modalidad}));

  if (!filas.length) return aviso('#avisoApuntes', 'Ya estaban todos así.', 'ok');

  const {error} = await sb.from('apuntes')
    .upsert(filas, {onConflict: 'persona_id,dia_id,servicio'});
  if (error) return aviso('#avisoApuntes', error.message, 'err');

  const r = await sb.from('apuntes').select('*');
  if (!r.error) DB.apuntes = r.data;
  pintarApuntes();
}

async function vaciarServicio(dia_id, servicio){
  const cuantos = apuntesDe(dia_id, servicio).length;
  if (!cuantos) return;
  if (!confirm(`¿Quitar a las ${cuantos} personas apuntadas?`)) return;

  const {error} = await sb.from('apuntes').delete().eq('dia_id', dia_id).eq('servicio', servicio);
  if (error) return aviso('#avisoApuntes', error.message, 'err');
  DB.apuntes = DB.apuntes.filter(x => !(x.dia_id === dia_id && x.servicio === servicio));
  pintarApuntes();
}

// ============================================================
// TURNOS
// ============================================================
function pintarTurnosAdmin(){
  if (!DB.dias.length){ $('#adminTurnos').innerHTML = '<p class="vacio">Sin días.</p>'; return; }
  const tipos = Object.keys(TIPOS_TURNO);
  let html = '<div class="panel"><h2>Asignar turnos</h2><div class="tabla-wrap"><table><thead><tr><th>Día</th>' +
    tipos.map(t => `<th>${esc(TIPOS_TURNO[t])}</th>`).join('') + '</tr></thead><tbody>';

  for (const d of DB.dias){
    html += `<tr><td><b>${esc(fechaCorta(d.fecha))}</b></td>`;
    for (const tipo of tipos){
      const t = DB.turnos.find(x => x.dia_id === d.id && x.tipo === tipo);
      html += `<td><select onchange="ponerTurno(${d.id}, '${tipo}', this.value)">
        <option value="">—</option>
        ${activos().map(p => `<option value="${p.id}" ${t && t.persona_id === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
      </select></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div></div>';
  $('#adminTurnos').innerHTML = html;
}

async function ponerTurno(dia_id, tipo, persona_id){
  const existente = DB.turnos.find(x => x.dia_id === dia_id && x.tipo === tipo);

  if (!persona_id){
    if (existente){
      const {error} = await sb.from('turnos').delete().eq('id', existente.id);
      if (error) return aviso('#estado', error.message, 'err');
    }
  } else if (existente){
    const {error} = await sb.from('turnos').update({persona_id: Number(persona_id)}).eq('id', existente.id);
    if (error) return aviso('#estado', error.message, 'err');
  } else {
    // los turnos de cocina reciben un código para que el responsable cobre
    const fila = {dia_id, tipo, persona_id: Number(persona_id)};
    if (tipo.startsWith('cocina')) fila.codigo = palabraAleatoria();
    const {error} = await sb.from('turnos').insert(fila);
    if (error) return aviso('#estado', error.message, 'err');
  }
  await recargar();
}

const PALABRAS = ['paella','tomate','higuera','naranja','sarten','cuchara','romero','alcachofa','bodega',
                  'melon','pimiento','laurel','almendra','clavel','morcilla','tortilla','canela','pimenton',
                  'chorizo','sandia','garbanzo','perejil','anis','olivo','sepia','mejillon','conejo','nispero'];

function palabraAleatoria(){
  const usadas = new Set(DB.turnos.map(t => t.codigo).filter(Boolean));
  const libres = PALABRAS.filter(p => !usadas.has(p));
  if (libres.length) return libres[Math.floor(Math.random() * libres.length)];
  return PALABRAS[Math.floor(Math.random() * PALABRAS.length)] + Math.floor(Math.random() * 90 + 10);
}

// ============================================================
// GASTOS GENERALES
// ============================================================
async function addGasto(){
  const concepto = $('#gConcepto').value.trim();
  const importe  = parseFloat($('#gImporte').value);
  if (!concepto || !importe) return aviso('#estado', 'Falta el concepto o el importe.', 'err');

  const {error} = await sb.from('gastos').insert({
    concepto, importe, fecha: hoyISO(),
    responsable_id: Number($('#gResp').value) || null
  });
  if (error) return aviso('#estado', error.message, 'err');
  $('#gConcepto').value = ''; $('#gImporte').value = '';
  await recargar();
}

function pintarGastos(){
  const total = DB.gastos.reduce((s, g) => s + Number(g.importe), 0);

  if (!DB.gastos.length) $('#tablaGastos').innerHTML = '<p class="vacio">Sin gastos anotados.</p>';
  else {
    let html = '<div class="tabla-wrap"><table><thead><tr><th>Concepto</th><th>Lo pagó</th><th class="num">Importe</th><th></th></tr></thead><tbody>';
    for (const g of DB.gastos){
      const r = persona(g.responsable_id);
      html += `<tr><td>${esc(g.concepto)}</td><td>${r ? esc(r.nombre) : '—'}</td>
        <td class="num">${eur(g.importe)}</td>
        <td><button class="mini peligro" onclick="borrarGasto(${g.id})">Borrar</button></td></tr>`;
    }
    html += `</tbody><tfoot><tr class="total"><td colspan="2">TOTAL</td><td class="num">${eur(total)}</td><td></td></tr></tfoot></table></div>`;
    $('#tablaGastos').innerHTML = html;
  }

  // reparto
  const cuentas = calcularCuentas().filter(c => c.persona.tipo === 'socio' && c.persona.activo);
  let html = '<div class="tabla-wrap"><table><thead><tr><th>Socio</th><th class="num">Peso</th><th class="num">Le toca</th><th class="num">Ha pagado</th><th class="num">Debe</th></tr></thead><tbody>';
  for (const c of cuentas){
    html += `<tr><td>${esc(c.persona.nombre)}</td>
      <td class="num">${c.persona.peso}</td>
      <td class="num">${eur(c.cuotaGenerales)}</td>
      <td class="num">${eur(c.generalesPagados)}</td>
      <td class="num ${c.generalesDebe > 0.005 ? 'debe' : 'saldado'}">${c.generalesDebe > 0.005 ? eur(c.generalesDebe) : '✓'}</td></tr>`;
  }
  html += '</tbody></table></div>';
  $('#tablaReparto').innerHTML = html;
}

async function borrarGasto(id){
  if (!confirm('¿Borrar este gasto?')) return;
  const {error} = await sb.from('gastos').delete().eq('id', id);
  if (error) return aviso('#estado', error.message, 'err');
  await recargar();
}

// ============================================================
// AJUSTES
// ============================================================
function pintarConfig(){
  $('#cNombre').value   = DB.config['nombre_peña'] || '';
  $('#cTesorero').value = DB.config['codigo_tesorero'] || '';

  const cocinas = DB.turnos.filter(t => t.tipo.startsWith('cocina') && t.persona_id);
  if (!cocinas.length){ $('#tablaCodigos').innerHTML = '<p class="vacio">Asigna turnos de cocina y aquí saldrán sus códigos.</p>'; return; }

  let html = '<div class="tabla-wrap"><table><thead><tr><th>Día</th><th>Servicio</th><th>Responsable</th><th>Código</th></tr></thead><tbody>';
  for (const t of cocinas){
    const d = dia(t.dia_id), p = persona(t.persona_id);
    html += `<tr><td>${esc(fechaCorta(d.fecha))}</td>
      <td>${t.tipo === 'cocina_cena' ? 'Cena' : 'Comida'}</td>
      <td>${p ? esc(p.nombre) : '—'}</td>
      <td><input value="${esc(t.codigo || '')}" style="width:130px"
            onchange="editarCodigo(${t.id}, this.value)"></td></tr>`;
  }
  $('#tablaCodigos').innerHTML = html + '</tbody></table></div>';
}

async function editarCodigo(turno_id, valor){
  const {error} = await sb.from('turnos').update({codigo: valor.trim().toLowerCase()}).eq('id', turno_id);
  if (error) return aviso('#estado', error.message, 'err');
  await recargar();
}

async function guardarConfig(){
  const filas = [
    {clave:'nombre_peña',     valor: $('#cNombre').value.trim()},
    {clave:'codigo_tesorero', valor: $('#cTesorero').value.trim().toLowerCase()}
  ];
  const {error} = await sb.from('config').upsert(filas, {onConflict: 'clave'});
  if (error) return aviso('#avisoConfig', error.message, 'err');
  aviso('#avisoConfig', 'Ajustes guardados.', 'ok');
  await recargar();
}
