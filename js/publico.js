// ============================================================
// Pantalla pública (solo lectura, salvo marcar cobros con código)
// ============================================================

let iDia = 0;                 // índice del día mostrado en la pestaña "Hoy"
let permisos = null;          // { tipo:'tesorero' } | { tipo:'turno', turnos:[...] }

// ---------------- arranque ----------------
document.addEventListener('DOMContentLoaded', async () => {
  $$('nav.tabs button').forEach(b => b.addEventListener('click', () => cambiarTab(b.dataset.tab)));
  $('#diaAnt').addEventListener('click', () => moverDia(-1));
  $('#diaSig').addEventListener('click', () => moverDia(1));
  $('#selPersona').addEventListener('change', pintarMias);
  $('#btnCodigo').addEventListener('click', comprobarCodigo);
  $('#codigoResp').addEventListener('keydown', e => { if (e.key === 'Enter') comprobarCodigo(); });

  if (SUPABASE_KEY === 'PEGA_AQUI_TU_CLAVE_PUBLICA'){
    aviso('#estado', 'Falta configurar la clave de Supabase en js/config.js', 'err');
    return;
  }
  try {
    await cargarTodo();
    arrancar();
  } catch (e) {
    aviso('#estado', 'No se pudo conectar con la base de datos: ' + e.message, 'err');
  }
});

function arrancar(){
  document.title = DB.config['nombre_peña'] || 'Peña La Paya';
  $('#tituloPena').textContent = DB.config['nombre_peña'] || 'Peña La Paya';
  const f = DB.dias[0], u = DB.dias[DB.dias.length-1];
  $('#subtitulo').textContent = f ? `Fiestas · ${fechaCorta(f.fecha)} a ${fechaCorta(u.fecha)}` : 'Sin días programados';

  // situarse en hoy, o en el día más cercano
  const hoy = hoyISO();
  iDia = DB.dias.findIndex(d => d.fecha >= hoy);
  if (iDia < 0) iDia = Math.max(0, DB.dias.length - 1);

  rellenarSelectorPersonas();
  pintarDia(); pintarCalendario(); pintarTurnos(); pintarCuentas();
}

function cambiarTab(id){
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
  $$('section.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + id));
}

// ---------------- pestaña HOY ----------------
function moverDia(paso){
  iDia = Math.min(DB.dias.length - 1, Math.max(0, iDia + paso));
  pintarDia();
}

function pintarDia(){
  const d = DB.dias[iDia];
  if (!d){ $('#diaFecha').textContent = '—'; $('#resumenDia').innerHTML = '<p class="vacio">No hay días programados.</p>'; return; }

  $('#diaFecha').textContent = fechaLarga(d.fecha);
  $('#diaAnt').disabled = iDia === 0;
  $('#diaSig').disabled = iDia === DB.dias.length - 1;

  let html = '';

  // tarjetas de recuento
  const comen = d.hay_comida ? apuntesDe(d.id, 'comida') : [];
  const cenan = d.hay_cena   ? apuntesDe(d.id, 'cena')   : [];
  html += '<div class="tarjetas">';
  if (d.hay_comida) html += tarjetaRecuento('Comida', comen, d.menu_comida);
  if (d.hay_cena)   html += tarjetaRecuento('Cena',   cenan, d.menu_cena);
  html += '</div>';

  // turnos del día
  html += '<div class="panel"><h2>Turnos del día</h2>';
  if (!turnosDe(d.id).length) html += '<p class="vacio">Sin turnos asignados.</p>';
  else {
    html += '<div class="tabla-wrap"><table><tbody>';
    for (const tipo of Object.keys(TIPOS_TURNO)){
      const gente = personasTurno(d.id, tipo);
      if (!gente.length) continue;
      html += `<tr><th>${esc(TIPOS_TURNO[tipo])}</th>
        <td>${gente.map(p => esc(p.nombre)).join(' · ')}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }
  html += '</div>';

  // quién viene
  if (d.hay_comida) html += listaApuntados('Comen', comen);
  if (d.hay_cena)   html += listaApuntados('Cenan', cenan);

  $('#resumenDia').innerHTML = html;
}

function tarjetaRecuento(titulo, lista, menu){
  const dineroComida = lista.reduce((s, a) => s + parteComida(a), 0);
  return `<div class="panel">
    <h3 style="margin-top:0">${titulo}</h3>
    <div class="dato">${lista.length}<small>personas en total</small></div>
    <div style="margin-top:6px;font-weight:700;color:var(--verde-900)">${eur(dineroComida)}<span style="font-weight:400;color:var(--tinta-70)"> para cocinar, incluye bebida y postre</span></div>
    ${menu ? `<div style="margin-top:10px"><b>Menú:</b> ${esc(menu)}</div>` : ''}
  </div>`;
}

function listaApuntados(titulo, lista){
  if (!lista.length) return `<div class="panel"><h2>${titulo}</h2><p class="vacio">Nadie apuntado todavía.</p></div>`;
  const gente = lista
    .map(a => ({a, p: persona(a.persona_id)}))
    .filter(x => x.p)
    .sort((x, y) => x.p.nombre.localeCompare(y.p.nombre))
    .map(({a, p}) => `<span class="apuntado" title="${esc(MODALIDADES[a.modalidad])}">
        <span class="icono">${ICONO_MODALIDAD[a.modalidad]}</span>${esc(p.nombre)}${
        p.tipo === 'invitado' ? '<span class="pill inv">inv.</span>' : ''}</span>`).join('');
  return `<div class="panel"><h2>${titulo} <span class="cuenta">${lista.length}</span></h2>
    <div class="gente">${gente}</div>
    <div class="leyenda">${Object.keys(ICONO_MODALIDAD)
      .map(m => `<span><span class="icono">${ICONO_MODALIDAD[m]}</span>${esc(MODALIDADES[m])}</span>`).join('')}</div>
  </div>`;
}

// ---------------- pestaña CALENDARIO ----------------
function pintarCalendario(){
  if (!DB.dias.length){ $('#calendario').innerHTML = '<p class="vacio">Sin días programados.</p>'; return; }

  let html = `<div class="panel"><h2>Todos los días</h2><div class="tabla-wrap"><table>
    <thead>
      <tr>
        <th rowspan="2">Día</th>
        <th colspan="3">Comida</th>
        <th colspan="3">Cena</th>
      </tr>
      <tr>
        <th>Menú</th><th class="num">Comen</th><th class="num">Sobremesa</th>
        <th>Menú</th><th class="num">Cenan</th><th class="num">Sobremesa</th>
      </tr>
    </thead><tbody>`;

  let tComen = 0, tSobComida = 0, tCenan = 0, tSobCena = 0;

  for (const d of DB.dias){
    html += `<tr><td><b>${esc(fechaCorta(d.fecha))}</b></td>`;
    for (const servicio of ['comida','cena']){
      const hay = servicio === 'comida' ? d.hay_comida : d.hay_cena;
      if (!hay){
        html += '<td colspan="3" style="color:var(--tinta-40)">no hay</td>';
        continue;
      }
      const lista = apuntesDe(d.id, servicio);
      // "solo sobremesa" también se queda a la sobremesa, aunque no coma
      const sob   = lista.filter(a => a.modalidad !== 'completo').length;
      const menu  = servicio === 'comida' ? d.menu_comida : d.menu_cena;

      if (servicio === 'comida'){ tComen += lista.length; tSobComida += sob; }
      else                      { tCenan += lista.length; tSobCena   += sob; }

      html += `<td>${esc(menu || '—')}</td>
        <td class="num">${lista.length}</td>
        <td class="num">${sob || '<span style="color:var(--tinta-40)">0</span>'}</td>`;
    }
    html += '</tr>';
  }

  html += `</tbody><tfoot><tr class="total">
      <td>TOTAL</td>
      <td></td><td class="num">${tComen}</td><td class="num">${tSobComida}</td>
      <td></td><td class="num">${tCenan}</td><td class="num">${tSobCena}</td>
    </tr></tfoot></table></div></div>`;

  $('#calendario').innerHTML = html;
}

// ---------------- pestaña TURNOS ----------------
function pintarTurnos(){
  let html = '';

  // Montaje y recogida: grupos de personas, sin día
  html += '<div class="tarjetas">';
  for (const tipo of Object.keys(TIPOS_TAREA)){
    const gente = personasTarea(tipo);
    const fecha = DB.config['fecha_' + tipo];
    html += `<div class="panel">
      <h3 style="margin-top:0">${esc(TIPOS_TAREA[tipo])}</h3>
      ${fecha ? `<div style="font-weight:600;margin-bottom:8px">${esc(fechaLarga(fecha))}</div>`
              : '<div style="color:var(--tinta-70);margin-bottom:8px">Fecha por concretar</div>'}
      ${gente.length
        ? `<div>${gente.map(p => esc(p.nombre)).join(' · ')}</div>
           <div style="margin-top:8px;font-size:.82rem;color:var(--tinta-70)">${gente.length} personas</div>`
        : '<p class="vacio">Nadie asignado todavía.</p>'}
    </div>`;
  }
  html += '</div>';

  // Cuadrante por días
  const tipos = Object.keys(TIPOS_TURNO);
  html += '<div class="panel"><h2>Turnos de cada día</h2><div class="tabla-wrap"><table><thead><tr><th>Día</th>' +
    tipos.map(t => `<th>${esc(TIPOS_TURNO[t])}</th>`).join('') + '</tr></thead><tbody>';
  for (const d of DB.dias){
    html += `<tr><td><b>${esc(fechaCorta(d.fecha))}</b></td>`;
    for (const t of tipos){
      const gente = personasTurno(d.id, t);
      html += `<td>${gente.length
        ? gente.map(p => esc(p.nombre)).join('<br>')
        : '<span style="color:var(--linea-fuerte)">·</span>'}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div></div>';
  $('#turnos').innerHTML = html;
}

// ---------------- pestaña CUENTAS ----------------
function pintarCuentas(){
  const cuentas = calcularCuentas().filter(c => c.persona.activo);
  const totalGastos = DB.gastos.reduce((s, g) => s + Number(g.importe), 0);

  const {comida, sobremesa} = totalPorCategoria();
  let html = `<div class="panel"><h2>Recaudación de comidas</h2>
    <div class="tarjetas">
      <div><div class="dato">${eur(comida)}<small>total comida · se compra día a día</small></div></div>
      <div><div class="dato">${eur(sobremesa)}<small>total sobremesa · se compra de una vez</small></div></div>
    </div></div>`;

  html += `<div class="panel"><h2>Gastos generales</h2>
    <div class="dato">${eur(totalGastos)}<small>se reparten entre los ${socios().length} socios</small></div>`;
  if (DB.gastos.length){
    html += '<div class="tabla-wrap" style="margin-top:10px"><table><thead><tr><th>Concepto</th><th>Pagó</th><th class="num">Importe</th></tr></thead><tbody>';
    for (const g of DB.gastos){
      const r = persona(g.responsable_id);
      html += `<tr><td>${esc(g.concepto)}</td><td>${r ? esc(r.nombre) : '—'}</td><td class="num">${eur(g.importe)}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }
  html += '</div>';

  html += tablaDineroPorDia();

  html += `<div class="panel"><h2>Cuentas por persona</h2><div class="tabla-wrap"><table><thead><tr>
      <th>Persona</th><th class="num">Comida</th><th class="num">Sobremesa</th><th class="num">Generales</th>
      <th class="num">Total</th><th class="num">Pagado</th><th class="num">Debe</th></tr></thead><tbody>`;

  const orden = [...cuentas].sort((a, b) => a.persona.nombre.localeCompare(b.persona.nombre));
  for (const c of orden){
    html += `<tr>
      <td>${esc(c.persona.nombre)} ${c.persona.tipo === 'invitado' ? '<span class="pill inv">inv.</span>' : ''}</td>
      <td class="num">${eur(c.consumoComida)}</td>
      <td class="num">${eur(c.consumoSobremesa)}</td>
      <td class="num">${c.persona.tipo === 'invitado' ? '—' : eur(c.cuotaGenerales)}</td>
      <td class="num">${eur(c.total)}</td>
      <td class="num">${eur(c.pagado)}</td>
      <td class="num ${c.debe > 0.005 ? 'debe' : 'saldado'}">${c.debe > 0.005 ? eur(c.debe) : '✓'}</td>
    </tr>`;
  }
  const sum = k => cuentas.reduce((s, c) => s + c[k], 0);
  html += `</tbody><tfoot><tr class="total">
      <td>TOTAL</td><td class="num">${eur(sum('consumoComida'))}</td><td class="num">${eur(sum('consumoSobremesa'))}</td>
      <td class="num">${eur(sum('cuotaGenerales'))}</td>
      <td class="num">${eur(sum('total'))}</td><td class="num">${eur(sum('pagado'))}</td>
      <td class="num">${eur(sum('debe'))}</td></tr></tfoot></table></div></div>`;

  $('#cuentas').innerHTML = html;
}

// Dinero de cada día, desglosado por servicio: comida, sobremesa y completo
function tablaDineroPorDia(){
  if (!DB.dias.length) return '';

  let html = `<div class="panel"><h2>Dinero de cada día</h2><div class="tabla-wrap"><table>
    <thead>
      <tr>
        <th rowspan="2">Día</th>
        <th colspan="3">Comida</th>
        <th colspan="3">Cena</th>
      </tr>
      <tr>
        <th class="num">Comida</th><th class="num">Sobremesa</th><th class="num">Completo</th>
        <th class="num">Comida</th><th class="num">Sobremesa</th><th class="num">Completo</th>
      </tr>
    </thead><tbody>`;

  const tot = {comida:{comida:0, sobremesa:0, completo:0}, cena:{comida:0, sobremesa:0, completo:0}};

  for (const d of DB.dias){
    html += `<tr><td><b>${esc(fechaCorta(d.fecha))}</b></td>`;
    for (const servicio of ['comida','cena']){
      const hay = servicio === 'comida' ? d.hay_comida : d.hay_cena;
      if (!hay){
        html += '<td colspan="3" style="color:var(--tinta-40)">no hay</td>';
        continue;
      }
      const m = dineroServicio(d.id, servicio);
      tot[servicio].comida    += m.comida;
      tot[servicio].sobremesa += m.sobremesa;
      tot[servicio].completo  += m.completo;
      html += `<td class="num">${eur(m.comida)}</td>
        <td class="num">${eur(m.sobremesa)}</td>
        <td class="num"><b>${eur(m.completo)}</b></td>`;
    }
    html += '</tr>';
  }

  html += `</tbody><tfoot><tr class="total">
      <td>TOTAL</td>
      <td class="num">${eur(tot.comida.comida)}</td><td class="num">${eur(tot.comida.sobremesa)}</td><td class="num">${eur(tot.comida.completo)}</td>
      <td class="num">${eur(tot.cena.comida)}</td><td class="num">${eur(tot.cena.sobremesa)}</td><td class="num">${eur(tot.cena.completo)}</td>
    </tr></tfoot></table></div></div>`;

  return html;
}

// ---------------- pestaña LO MÍO ----------------
function rellenarSelectorPersonas(){
  const sel = $('#selPersona');
  sel.innerHTML = '<option value="">—</option>' +
    activos().map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  const guardado = localStorage.getItem('lapaya_persona');
  if (guardado && activos().some(p => p.id == guardado)){ sel.value = guardado; pintarMias(); }
}

function pintarMias(){
  const id = Number($('#selPersona').value);
  if (!id){ $('#mias').innerHTML = ''; localStorage.removeItem('lapaya_persona'); return; }
  localStorage.setItem('lapaya_persona', id);

  const p = persona(id);
  const c = calcularCuentas().find(x => x.persona.id === id);

  // mis turnos por día y mis tareas de peña
  const mt = DB.turnos.filter(t => t.persona_id === id)
    .sort((a, b) => (dia(a.dia_id)?.fecha || '').localeCompare(dia(b.dia_id)?.fecha || ''));
  const misTareas = DB.tareas.filter(t => t.persona_id === id);

  let htmlTurnos = '<div class="panel"><h2>Tus turnos</h2>';

  for (const t of misTareas){
    const fecha = DB.config['fecha_' + t.tipo];
    htmlTurnos += `<div style="padding:9px 11px;background:var(--verde-50);border-radius:7px;margin-bottom:8px">
      <b>${esc(TIPOS_TAREA[t.tipo])}</b>
      <span style="color:var(--tinta-70)"> · ${fecha ? esc(fechaLarga(fecha)) : 'fecha por concretar'}</span>
    </div>`;
  }

  if (mt.length){
    htmlTurnos += '<div class="tabla-wrap"><table><tbody>';
    for (const t of mt){
      htmlTurnos += `<tr><td><b>${esc(fechaCorta(dia(t.dia_id).fecha))}</b></td>
        <td>${esc(TIPOS_TURNO[t.tipo])}</td>
        <td style="color:var(--tinta-70)">${esc(t.notas || '')}</td></tr>`;
    }
    htmlTurnos += '</tbody></table></div>';
  } else if (!misTareas.length){
    htmlTurnos += '<p class="vacio">No tienes turnos ni tareas asignadas.</p>';
  }
  htmlTurnos += '</div>';

  let htmlCuenta = `<div class="panel"><h2>Tu cuenta</h2><div class="tarjetas">
      <div><div class="dato">${eur(c.total)}<small>total que te toca</small></div></div>
      <div><div class="dato">${eur(c.pagado)}<small>ya has pagado</small></div></div>
      <div><div class="dato ${c.debe > 0.005 ? 'debe' : 'saldado'}">${eur(c.debe)}<small>te falta por pagar</small></div></div>
    </div>`;
  if (p.tipo === 'socio'){
    htmlCuenta += `<p style="font-size:.85rem;color:var(--tinta-70)">
      Incluye ${eur(c.cuotaGenerales)} de gastos generales (de los que llevas pagados ${eur(c.generalesPagados)}).</p>`;
  } else {
    const s = persona(p.socio_id);
    htmlCuenta += `<p style="font-size:.85rem;color:var(--tinta-70)">Eres invitado${s ? ' de ' + esc(s.nombre) : ''}: no pagas gastos generales.</p>`;
  }
  htmlCuenta += '</div>';

  // mis comidas
  const mios = DB.apuntes.filter(a => a.persona_id === id)
    .sort((a, b) => (dia(a.dia_id)?.fecha || '').localeCompare(dia(b.dia_id)?.fecha || ''));
  let htmlComidas = '<div class="panel"><h2>Tus comidas y cenas</h2>';
  if (!mios.length) htmlComidas += '<p class="vacio">No estás apuntado a nada todavía.</p>';
  else {
    htmlComidas += '<div class="tabla-wrap"><table><thead><tr><th>Día</th><th>Servicio</th><th>Modalidad</th><th class="num">Precio</th><th>Cobro</th></tr></thead><tbody>';
    for (const a of mios){
      htmlComidas += `<tr><td>${esc(fechaCorta(dia(a.dia_id).fecha))}</td>
        <td>${a.servicio === 'comida' ? 'Comida' : 'Cena'}</td>
        <td>${esc(MODALIDADES[a.modalidad])}</td>
        <td class="num">${eur(precioApunte(a))}</td>
        <td>${a.pagado ? '<span class="pill ok">pagado</span>' : '<span class="pill no">pendiente</span>'}</td></tr>`;
    }
    htmlComidas += '</tbody></table></div>';
  }
  htmlComidas += '</div>';

  const html = htmlTurnos + htmlCuenta + htmlComidas;

  $('#mias').innerHTML = html;
}

// ---------------- pestaña COBROS ----------------
function comprobarCodigo(){
  const codigo = $('#codigoResp').value.trim().toLowerCase();
  if (!codigo) return;

  if (codigo === (DB.config['codigo_tesorero'] || '').toLowerCase()){
    permisos = {tipo:'tesorero'};
    aviso('#avisoCobros', 'Código de tesorero correcto.', 'ok');
    return pintarCobros();
  }
  // varios responsables comparten código, así que puede haber filas repetidas
  const vistos = new Set();
  const mis = DB.turnos
    .filter(t => t.codigo && t.codigo.trim().toLowerCase() === codigo)
    .filter(t => {
      const clave = t.dia_id + '|' + t.tipo;
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  if (mis.length){
    permisos = {tipo:'turno', turnos:mis};
    aviso('#avisoCobros', `Código correcto: ${mis.length} servicio(s) a tu cargo.`, 'ok');
    return pintarCobros();
  }
  permisos = null;
  $('#cobros').innerHTML = '';
  aviso('#avisoCobros', 'Ese código no corresponde a ningún responsable.', 'err');
}

function pintarCobros(){
  if (!permisos) return;
  let html = '';

  if (permisos.tipo === 'tesorero'){
    const cuentas = calcularCuentas().filter(c => c.persona.tipo === 'socio' && c.persona.activo);
    html += `<div class="panel"><h2>Gastos generales · quién ha pagado</h2>
      <div class="tabla-wrap"><table><thead><tr>
        <th>Socio</th><th class="num">Le toca</th><th class="num">Ha pagado</th><th class="num">Debe</th><th>Anotar</th>
      </tr></thead><tbody>`;
    for (const c of cuentas){
      html += `<tr>
        <td>${esc(c.persona.nombre)}</td>
        <td class="num">${eur(c.cuotaGenerales)}</td>
        <td class="num">${eur(c.generalesPagados)}</td>
        <td class="num ${c.generalesDebe > 0.005 ? 'debe' : 'saldado'}">${c.generalesDebe > 0.005 ? eur(c.generalesDebe) : '✓'}</td>
        <td>
          <input type="number" step="0.01" style="width:85px" id="pg-${c.persona.id}"
                 placeholder="${c.generalesDebe.toFixed(2)}">
          <button class="mini" onclick="anotarPago(${c.persona.id})">Anotar</button>
        </td></tr>`;
    }
    html += '</tbody></table></div></div>';

    if (DB.pagos.length){
      html += '<div class="panel"><h3>Pagos anotados</h3><div class="tabla-wrap"><table><tbody>';
      for (const g of [...DB.pagos].reverse()){
        const p = persona(g.persona_id);
        html += `<tr><td>${p ? esc(p.nombre) : '?'}</td><td class="num">${eur(g.importe)}</td>
          <td style="color:var(--tinta-70)">${esc(g.fecha)}</td>
          <td><button class="mini peligro" onclick="borrarPago(${g.id})">Borrar</button></td></tr>`;
      }
      html += '</tbody></table></div></div>';
    }
  } else {
    for (const t of permisos.turnos){
      const d = dia(t.dia_id);
      const servicio = t.tipo === 'cocina_cena' ? 'cena' : 'comida';
      const lista = apuntesDe(t.dia_id, servicio)
        .map(a => ({a, p: persona(a.persona_id)})).filter(x => x.p)
        .sort((x, y) => x.p.nombre.localeCompare(y.p.nombre));

      const equipo = personasTurno(t.dia_id, t.tipo);
      html += `<div class="panel"><h2>${esc(fechaLarga(d.fecha))} · ${servicio}</h2>
        <p style="margin-top:0;color:var(--tinta-70);font-size:.85rem">
          A cargo de ${esc(equipo.map(p => p.nombre).join(' · '))}</p>`;
      if (!lista.length) html += '<p class="vacio">Nadie apuntado.</p>';
      else {
        html += '<div class="tabla-wrap"><table><thead><tr><th>Persona</th><th>Modalidad</th><th class="num">Precio</th><th>Ha pagado</th></tr></thead><tbody>';
        for (const {a, p} of lista){
          html += `<tr><td>${esc(p.nombre)}</td><td>${esc(MODALIDADES[a.modalidad])}</td>
            <td class="num">${eur(precioApunte(a))}</td>
            <td><input type="checkbox" ${a.pagado ? 'checked' : ''} onchange="marcarPagado(${a.id}, this.checked)"></td></tr>`;
        }
        const pendiente = lista.filter(x => !x.a.pagado).reduce((s, x) => s + precioApunte(x.a), 0);
        html += `</tbody><tfoot><tr class="total"><td colspan="2">Te falta por cobrar</td>
          <td class="num">${eur(pendiente)}</td><td></td></tr></tfoot></table></div>`;
      }
      html += '</div>';
    }
  }
  $('#cobros').innerHTML = html;
}

async function marcarPagado(apunte_id, valor){
  const {error} = await sb.from('apuntes').update({pagado: valor}).eq('id', apunte_id);
  if (error) return aviso('#avisoCobros', 'No se pudo guardar: ' + error.message, 'err');
  const a = DB.apuntes.find(x => x.id === apunte_id);
  if (a) a.pagado = valor;
  pintarCobros(); pintarCuentas(); pintarDia(); pintarMias();
}

async function anotarPago(persona_id){
  const campo = $('#pg-' + persona_id);
  const importe = parseFloat(campo.value);
  if (!importe || importe <= 0) return aviso('#avisoCobros', 'Escribe un importe válido.', 'err');

  const {data, error} = await sb.from('pagos')
    .insert({persona_id, importe, fecha: hoyISO(), nota: 'gastos generales'}).select();
  if (error) return aviso('#avisoCobros', 'No se pudo guardar: ' + error.message, 'err');

  DB.pagos.push(data[0]);
  campo.value = '';
  pintarCobros(); pintarCuentas(); pintarMias();
  aviso('#avisoCobros', 'Pago anotado.', 'ok');
}

async function borrarPago(id){
  const {error} = await sb.from('pagos').delete().eq('id', id);
  if (error) return aviso('#avisoCobros', 'No se pudo borrar: ' + error.message, 'err');
  DB.pagos = DB.pagos.filter(p => p.id !== id);
  pintarCobros(); pintarCuentas(); pintarMias();
}
