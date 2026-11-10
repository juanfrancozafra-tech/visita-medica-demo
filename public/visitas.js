// Visitas médicas — semana, planear un día, marcar estados y ciclos.
// Recibe de app.js las utilidades comunes (api, toast, hojas, barra superior) para no duplicarlas.
import { MARCAS, SIN_MARCA, MEDICAMENTOS, LIMITE, fijos, armar } from './marcas.js';

let C; // contexto: { app, api, esc, toast, go, openSheet, closeSheet, topbar, bindTopbar, copyText, ICON }
export const setupVisitas = (ctx) => (C = ctx);

// ---------- utilidades ----------
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const D = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => new Date(D(s).getTime() + n * 86400000).toISOString().slice(0, 10);
const diaNombre = (s) => DIAS[D(s).getUTCDay()];
const diaNum = (s) => Number(s.slice(8));
const largo = (s) => `${diaNombre(s)} ${diaNum(s)} de ${MESES[Number(s.slice(5, 7)) - 1]}`;
const rango = (lun) => {
  const vie = addDays(lun, 4);
  const m1 = MESES[Number(lun.slice(5, 7)) - 1], m2 = MESES[Number(vie.slice(5, 7)) - 1];
  return m1 === m2 ? `${diaNum(lun)} – ${diaNum(vie)} de ${m1}` : `${diaNum(lun)} de ${m1} – ${diaNum(vie)} de ${m2}`;
};
const lunesDe = (s) => addDays(s, -((D(s).getUTCDay() + 6) % 7));
const PEQ = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
// "CLINICA DE OCCIDENTE" → "Clinica de Occidente"
const nice = (s) =>
  String(s || '')
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i && PEQ.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
const ciudadNice = (c) => (c === 'GUADALAJARA DE BUGA' ? 'Buga' : nice(c));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const store = {
  get: (k, d) => {
    try {
      return JSON.parse(localStorage.getItem('v:' + k)) ?? d;
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem('v:' + k, JSON.stringify(v));
    } catch {}
  },
};
const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

const IC = {
  persona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  farmacia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><g transform="rotate(-45 12 12)"><rect x="3" y="8" width="18" height="8" rx="4"/><path d="M7 8h5v8H7a4 4 0 0 1 0-8z" fill="currentColor"/></g></svg>',
  grip: '<svg viewBox="0 0 14 18" fill="currentColor" aria-hidden="true"><circle cx="4" cy="3" r="1.6"/><circle cx="10" cy="3" r="1.6"/><circle cx="4" cy="9" r="1.6"/><circle cx="10" cy="9" r="1.6"/><circle cx="4" cy="15" r="1.6"/><circle cx="10" cy="15" r="1.6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
};

// Chip de estado (etiqueta, clase). Las visitas de días futuros no llevan chip.
const ESTADO = {
  por_hacer: ['Por hacer', 'todo'],
  programada: ['', ''],
  no_realizada: ['No realizada', 'gray'],
  pendiente: ['Pendiente reporte', 'amber'],
  listo: ['Reporte listo', 'green'],
  ne_pendiente: ['No efectiva · reportar', 'orange'],
  ne_listo: ['No efectiva', 'orange'],
};

// ---------- semana ----------
const contactos = (d) => d.visitas.filter((v) => v.tipo === 'persona' && v.estado !== 'no_realizada').length;
const farmacias = (d) => d.visitas.filter((v) => v.tipo === 'farmacia' && v.estado !== 'no_realizada').length;
const listos = (d, tipo) => d.visitas.filter((v) => v.tipo === tipo && v.estado === 'listo').length;
const sinReporte = (v) => v.estado === 'pendiente' || v.estado === 'ne_pendiente';

// Avance frente a lo esperado (9 contactos / 3 farmacias por cada día hábil ya terminado, es decir hasta ayer) y frente al total.
// Lo hecho sí incluye las visitas de hoy con reporte listo.
// "98 de 126 esperados · (78%) · 28 por debajo · 54% del total". Verde si va al día o adelantada, naranja si va atrasada.
// Lo usan la semana y el ciclo. Si aún no se espera nada (semana futura), muestra "N de meta" sin la línea de ritmo.
function ritmo(label, hecho, total, esperado, femenino, deTotal = 'del total') {
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const dif = hecho - esperado;
  const ok = dif >= 0;
  const linea = !esperado ? '' : `(${pct(hecho, esperado)}%) · ${dif === 0 ? 'al día' : `${Math.abs(dif)} por ${ok ? 'encima' : 'debajo'}`}`;
  return `<div class="cic">
    <span class="cic-lbl">${label}</span>
    <b class="num">${hecho}<small> de ${esperado ? `${esperado} esperad${femenino ? 'as' : 'os'}` : total}</small></b>
    ${linea ? `<p class="cic-ritmo ${ok ? 'ok' : 'low'}">${linea}</p>` : ''}
    <p class="cic-tot">${pct(hecho, total)}% ${deTotal}</p>
  </div>`;
}

export async function renderWeek(lunesPedido, diaPedido) {
  const w = await C.api('GET', 'week' + (lunesPedido ? '?lunes=' + lunesPedido : ''));
  const esHoySemana = w.dias.some((d) => d.fecha === w.hoy);
  const sel = diaPedido && w.dias.some((d) => d.fecha === diaPedido) ? diaPedido : esHoySemana ? w.hoy : (w.dias.find((d) => d.habil) || w.dias[0]).fecha;
  const vista = store.get('como', 'semana');
  const s = w.semana, c = w.ciclo;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const cicloVigente = c && c.fecha_inicio <= w.hoy && c.fecha_fin >= w.hoy;
  const totalPend = w.pendientes_reporte.reduce((a, p) => a + p.n, 0);

  const pend = totalPend
    ? `<button class="banner warn" id="pendrep"><span><b>${w.pendientes_reporte.map((p) => p.etiqueta).join(', ')}:</b> ${totalPend} visita${totalPend > 1 ? 's' : ''} sin reporte en la app</span><span class="go">Revisar ›</span></button>`
    : '';
  const sinCiclo = !cicloVigente
    ? `<button class="banner info" data-go="#/ciclos"><span>No hay un ciclo para hoy. Ingresa el número y las fechas del ciclo actual.</span><span class="go">Ciclos ›</span></button>`
    : '';

  C.app.innerHTML = `<main class="wide visitas">
    ${C.topbar({ title: 'Semana' })}
    <div class="weeknav">
      <button class="iconbtn" data-w="-7" aria-label="Semana anterior">${IC.prev}</button>
      <h1>${rango(w.lunes)}</h1>
      <button class="iconbtn" data-w="7" aria-label="Semana siguiente">${IC.next}</button>
      ${esHoySemana ? '' : '<button class="pill" data-w="hoy">Hoy</button>'}
    </div>
    ${sinCiclo}${pend}
    <section class="card como" data-vista="${vista}">
      <div class="como-head"><h2>Cómo vamos</h2>
        <div class="seg" role="group" aria-label="Periodo"><button data-v="semana" aria-pressed="${vista === 'semana'}">Semana</button><button data-v="ciclo" aria-pressed="${vista === 'ciclo'}">Ciclo</button></div>
      </div>
      <div class="como-body">
        <div class="blk semana">
          <h3 class="desk">Semana<span> · ${rango(w.lunes)} · ${s.con_reporte} de ${s.programados} con reporte</span></h3>
          <p class="cic-sub mob">${rango(w.lunes)} · ${s.con_reporte} de ${s.programados} con reporte</p>
          <div class="cic-grid">
            ${ritmo('Contactos', s.contactos, s.meta_contactos, s.esperado_contactos, false, 'de la semana')}
            ${ritmo('Farmacias', s.farmacias, s.meta_farmacias, s.esperado_farmacias, true, 'de la semana')}
          </div>
        </div>
        <div class="blk ciclo">
          <h3 class="desk">${c ? `Ciclo ${c.numero}<span> · día ${c.dia} de ${c.dias_habiles} · quedan ${c.dias_restantes} día${c.dias_restantes === 1 ? '' : 's'}</span>` : 'Ciclo'}</h3>
          ${
            c
              ? `<p class="cic-sub mob">Ciclo ${c.numero} · día ${c.dia} de ${c.dias_habiles} · quedan ${c.dias_restantes} día${c.dias_restantes === 1 ? '' : 's'}</p>
          <div class="cic-grid">
            ${ritmo('Contactos', c.contactos, c.meta_contactos, c.meta_contactos_fecha)}
            ${ritmo('Farmacias', c.farmacias, c.meta_farmacias, c.meta_farmacias_fecha, true)}
          </div>`
              : '<p class="sub">Sin ciclo registrado.</p>'
          }
        </div>
      </div>
    </section>
    <nav class="daystrip" aria-label="Días de la semana">
      ${w.dias
        .map((d) => {
          const falta = d.habil && d.fecha >= w.hoy && contactos(d) < w.metas.contactos_dia;
          const alerta = d.fecha < w.hoy && d.visitas.some(sinReporte);
          return `<button data-d="${d.fecha}" class="${d.fecha === sel ? 'sel' : ''}" ${d.fecha === w.hoy ? 'aria-current="date"' : ''}>
            <span>${d.fecha === w.hoy ? 'Hoy' : diaNombre(d.fecha).slice(0, 3)}</span><b>${diaNum(d.fecha)}</b>
            <i class="${alerta || falta ? 'low' : ''}">${d.festivo ? 'Festivo' : d.visitas.length}${alerta ? ' •' : ''}</i></button>`;
        })
        .join('')}
    </nav>
    <div class="days">${w.dias.map((d) => dayPanel(d, w, d.fecha === sel)).join('')}</div>
  </main>`;
  C.bindTopbar(null);
  bindWeek(w);
}

function dayPanel(d, w, sel) {
  const hoy = d.fecha === w.hoy;
  const futuro = d.fecha >= w.hoy;
  const nc = contactos(d), nf = farmacias(d);
  const linea = hoy
    ? `<span class="ico">${IC.persona}<b>${listos(d, 'persona')}</b>/${w.metas.contactos_dia}</span><span class="ico">${IC.farmacia}<b>${listos(d, 'farmacia')}</b>/${w.metas.farmacias_dia}</span><span><b>${d.visitas.length}</b> programados</span>`
    : `<span class="ico">${IC.persona}<b>${nc}</b></span><span class="ico">${IC.farmacia}<b>${nf}</b></span><span><b>${d.visitas.length}</b> programados</span>`;
  const faltan = [];
  if (d.habil && futuro) {
    const fc = w.metas.contactos_dia - nc, ff = w.metas.farmacias_dia - nf;
    if (fc > 0) faltan.push(`${fc} contacto${fc > 1 ? 's' : ''}`);
    if (ff > 0) faltan.push(`${ff} farmacia${ff > 1 ? 's' : ''}`);
  }
  const sinRep = d.fecha < w.hoy ? d.visitas.filter(sinReporte).length : 0;
  const lista = (franja) => {
    const vs = d.visitas.filter((v) => v.franja === franja);
    return `<div class="vblock"><h3>${franja}<span>${vs.length || ''}</span></h3>
      <div class="vlist" data-fecha="${d.fecha}" data-franja="${franja}">${vs.map(row).join('') || '<div class="vempty">Sin visitas</div>'}</div></div>`;
  };
  return `<section class="daypanel ${sel ? 'sel' : ''} ${hoy ? 'today' : ''} ${d.festivo ? 'fest' : ''}" data-fecha="${d.fecha}">
    <header>
      <div><h2><span class="mob">${largo(d.fecha)}</span><span class="desk">${diaNombre(d.fecha)} ${diaNum(d.fecha)}</span></h2>
      ${d.festivo ? `<p class="dl">Festivo · ${C.esc(d.festivo)}</p>` : `<p class="dl">${linea}</p>`}
      ${faltan.length ? `<p class="falta">Faltan ${faltan.join(' y ')}</p>` : ''}
      ${sinRep ? `<p class="falta">${sinRep} sin reporte en la app</p>` : ''}</div>
      ${hoy ? '<span class="tag">Hoy</span>' : ''}
    </header>
    ${d.festivo ? '' : lista('AM') + lista('PM')}
    ${d.habil && futuro ? `<button class="addbtn" data-go="#/planear/${d.fecha}">${IC.plus} Agregar</button>` : ''}
    ${d.visitas.length ? `<div class="copyrow"><button class="btn secondary small" data-copy="c" data-f="${d.fecha}">${C.ICON.copy} Copiar contactos</button><button class="btn secondary small" data-copy="f" data-f="${d.fecha}">${C.ICON.copy} Copiar farmacias</button></div>` : ''}
  </section>`;
}

function row(v) {
  const [label, cls] = ESTADO[v.estado];
  const tachado = v.estado === 'no_realizada' ? 'tachado' : '';
  const sub = v.tipo === 'farmacia' ? 'Farmacia' : `${C.esc(v.esp)} · ${C.esc(nice(v.lugar))}`;
  const flecha = ['por_hacer', 'pendiente', 'ne_pendiente', 'no_realizada'].includes(v.estado) ? ' ▾' : '';
  return `<div class="vrow ${v.tipo === 'farmacia' ? 'f' : ''}" data-id="${v.id}">
    <button class="grip" aria-label="Mover ${C.esc(nice(v.nombre))}">${IC.grip}</button>
    <div class="vmain"><b class="${tachado}">${C.esc(nice(v.nombre))}</b><span>${sub}</span></div>
    ${label ? `<button class="schip ${cls}" data-chip="${v.id}">${label}${flecha}</button>` : `<button class="qx" data-quitar="${v.id}" aria-label="Quitar a ${C.esc(nice(v.nombre))} de este día">×</button>`}
  </div>`;
}

function bindWeek(w) {
  const all = w.dias.flatMap((d) => d.visitas);
  const byId = (id) => all.find((v) => v.id === Number(id));
  C.app.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => C.go(b.dataset.go)));
  C.app.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => C.go(b.dataset.w === 'hoy' ? '#/' : '#/semana/' + addDays(w.lunes, Number(b.dataset.w)))));
  const pr = document.getElementById('pendrep');
  if (pr) pr.onclick = () => C.go(`#/semana/${lunesDe(w.pendientes_reporte[0].fecha)}/${w.pendientes_reporte[0].fecha}`);
  const como = C.app.querySelector('.como');
  como.querySelectorAll('[data-v]').forEach(
    (b) =>
      (b.onclick = () => {
        store.set('como', b.dataset.v);
        como.dataset.vista = b.dataset.v;
        como.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      })
  );
  C.app.querySelectorAll('.daystrip [data-d]').forEach(
    (b) =>
      (b.onclick = () => {
        C.app.querySelectorAll('.daystrip [data-d]').forEach((x) => x.classList.toggle('sel', x === b));
        C.app.querySelectorAll('.daypanel').forEach((p) => p.classList.toggle('sel', p.dataset.fecha === b.dataset.d));
        history.replaceState(null, '', `#/semana/${w.lunes}/${b.dataset.d}`);
      })
  );
  C.app.querySelectorAll('[data-quitar]').forEach((b) => (b.onclick = () => quitar(byId(b.dataset.quitar))));
  C.app.querySelectorAll('[data-chip]').forEach((b) => (b.onclick = () => openChipMenu(byId(b.dataset.chip), w)));
  C.app.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyDay(w.dias.find((d) => d.fecha === b.dataset.f), b.dataset.copy)));
  enableDrag();
}

// Copia para pegar en el formato de planeación (por día): contactos = MÉDICO | ESP | DIRECCIÓN; farmacias = nombre.
async function copyDay(d, tipo) {
  const vs = ['AM', 'PM'].flatMap((f) => d.visitas.filter((v) => v.franja === f)).filter((v) => (tipo === 'c' ? v.tipo === 'persona' : v.tipo === 'farmacia'));
  if (!vs.length) return C.toast(tipo === 'c' ? 'Ese día no tiene contactos.' : 'Ese día no tiene farmacias.');
  const text = vs.map((v) => (tipo === 'c' ? [v.nombre, v.esp, v.lugar].join('\t') : v.nombre)).join('\n');
  await C.copyText(text);
  const dia = diaNombre(d.fecha).toLowerCase();
  C.toast(tipo === 'c' ? `Copiamos ${vs.length} contactos. Pégalos en la primera celda de MÉDICO del ${dia}.` : `Copiamos ${vs.length} farmacia(s). Pégalas bajo FARMACIAS del ${dia}.`);
}

// ---------- marcar estado ----------
function openChipMenu(v, w) {
  if (v.fecha > w.hoy) return quitar(v);
  const ops = [];
  const add = (key, label, cls = '') => ops.push(`<button class="opt ${cls}" data-op="${key}">${label}</button>`);
  const enReporte = location.hash.startsWith('#/reporte/');
  if (v.estado === 'por_hacer' || v.estado === 'no_realizada') {
    // Realizada / No efectiva abren el reporte (desde la semana).
    add('realizada', `${IC.check} Realizada${enReporte ? '' : ' · hacer reporte'}`, 'primary');
    add('no_efectiva', `No efectiva${enReporte ? '' : ' · hacer reporte'}`);
    add('tablet', 'Lo reporté directo en la tablet');
    if (!enReporte) add('quitar', 'Quitar de la planeación', 'danger');
  } else if (v.estado === 'pendiente' || v.estado === 'ne_pendiente') {
    if (!enReporte) add('reporte', `${IC.pen} Hacer reporte`, 'primary');
    add('tablet', 'Lo reporté directo en la tablet');
    if (v.estado === 'pendiente') add('no_efectiva', 'Cambiar a no efectiva');
    else add('realizada', 'Cambiar a realizada');
    add('por_hacer', 'Volver a "Por hacer"');
  } else {
    if (!enReporte) add('reporte', 'Ver reporte', 'primary');
    add('deshacer', 'Marcar como pendiente de reporte');
    add('por_hacer', 'Volver a "Por hacer"');
  }
  const el = C.openSheet(`<h2>${C.esc(nice(v.nombre))}</h2><p class="sub">${v.tipo === 'farmacia' ? 'Farmacia' : C.esc(v.esp + ' · ' + nice(v.lugar))}</p>
    <div class="opts">${ops.join('')}</div><div class="foot"><button class="btn secondary" data-close>Cancelar</button></div>`);
  el.querySelectorAll('[data-op]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          const op = b.dataset.op;
          if (op === 'reporte') {
            C.closeSheet();
            return C.go('#/reporte/' + v.id);
          }
          if (op === 'realizada' || op === 'no_efectiva') {
            await C.api('POST', `visits/${v.id}/estado`, { resultado: op });
            if (!enReporte) {
              C.closeSheet();
              return C.go('#/reporte/' + v.id);
            }
          }
          if (op === 'por_hacer') await C.api('POST', `visits/${v.id}/estado`, { resultado: null });
          if (op === 'tablet') await C.api('POST', `visits/${v.id}/reporte`, { via: 'tablet' });
          if (op === 'deshacer') await C.api('DELETE', `visits/${v.id}/reporte`);
          if (op === 'quitar') {
            C.closeSheet();
            return quitar(v);
          }
          C.closeSheet();
          reload();
        } catch (e) {
          C.toast(e.message, true);
          b.disabled = false;
        }
      })
  );
}

// ---------- quitar una visita de la planeación ----------
async function quitar(v) {
  if (!confirm(`¿Quitar a ${nice(v.nombre)} del ${largo(v.fecha).toLowerCase()}?`)) return;
  try {
    await C.api('DELETE', 'visits/' + v.id);
    C.toast('Visita quitada');
    reload();
  } catch (err) {
    C.toast(err.message, true);
  }
}

// ---------- arrastrar para mover (orden, AM/PM y, en computador, de día) ----------
function enableDrag() {
  C.app.querySelectorAll('.vrow .grip').forEach((g) => {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const rowEl = g.closest('.vrow');
      const from = rowEl.closest('.vlist');
      const rect = rowEl.getBoundingClientRect();
      const ph = document.createElement('div');
      ph.className = 'vph';
      ph.style.height = rect.height + 'px';
      rowEl.after(ph);
      Object.assign(rowEl.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', zIndex: 50, pointerEvents: 'none' });
      rowEl.classList.add('dragging');
      const dy = e.clientY - rect.top;
      const startY = e.clientY;
      g.setPointerCapture(e.pointerId);
      const move = (ev) => {
        rowEl.style.top = ev.clientY - dy + 'px';
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const list = under && under.closest('.vlist');
        if (!list) return;
        list.querySelector('.vempty')?.remove();
        const rows = [...list.querySelectorAll('.vrow:not(.dragging)')];
        const before = rows.find((r) => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
        if (before) before.before(ph);
        else list.append(ph);
      };
      const up = async (ev) => {
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        g.removeEventListener('pointercancel', up);
        rowEl.removeAttribute('style');
        rowEl.classList.remove('dragging');
        ph.replaceWith(rowEl);
        if (Math.abs((ev.clientY || startY) - startY) < 4 && rowEl.closest('.vlist') === from) return; // solo un toque
        const to = rowEl.closest('.vlist');
        const ids = (l) => [...l.querySelectorAll('.vrow')].map((r) => Number(r.dataset.id));
        try {
          await C.api('POST', 'visits/reorder', { fecha: to.dataset.fecha, franja: to.dataset.franja, ids: ids(to) });
          if (from !== to && ids(from).length) await C.api('POST', 'visits/reorder', { fecha: from.dataset.fecha, franja: from.dataset.franja, ids: ids(from) });
        } catch (err) {
          C.toast(err.message, true);
        }
        reload();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
      g.addEventListener('pointercancel', up);
    });
  });
}

// ---------- planear un día ----------
export async function renderPlan(fecha) {
  const a = await C.api('GET', 'available?fecha=' + fecha);
  const back = `#/semana/${lunesDe(fecha)}/${fecha}`;
  if (!a.habil) {
    C.toast(a.festivo ? `Ese día es festivo (${a.festivo}).` : 'Solo se planean visitas de lunes a viernes.', true);
    return C.go(back);
  }
  const cuenta = (c) => a.personas.filter((p) => p.ciudad === c).length;
  const ciudades = [...new Set([...a.personas.map((p) => p.ciudad), ...a.farmacias.map((f) => f.ciudad)])].sort((x, y) => cuenta(y) - cuenta(x));
  const st = { ciudad: ciudades.includes(store.get('ciudad')) ? store.get('ciudad') : ciudades[0], inst: '', q: '', sel: new Map() };
  const nombreDia = diaNombre(fecha).toLowerCase();

  C.app.innerHTML = `<main class="visitas plan">
    ${C.topbar({ title: 'Semana', back, menu: false })}
    <h1 class="ptitle">Agregar al ${largo(fecha).toLowerCase()}</h1>
    <p class="dl"><span class="ico">${IC.persona}<b>${a.dia.contactos}</b></span><span class="ico">${IC.farmacia}<b>${a.dia.farmacias}</b></span>${
      a.dia.contactos < a.metas.contactos_dia ? `<span class="low">faltan ${a.metas.contactos_dia - a.dia.contactos} contactos</span>` : ''
    }</p>
    <div class="chips" id="ciudades" role="group" aria-label="Ciudad"></div>
    <div class="pfilters">
      <label class="selectw"><span class="sr">Institución</span><select id="inst"></select></label>
      <label class="search">${C.ICON.search}<input type="search" id="q" placeholder="Buscar" aria-label="Buscar" autocomplete="off"><button type="button" class="qclear hidden" id="qclear" aria-label="Limpiar búsqueda">×</button></label>
    </div>
    <div class="phint"><span>Toca <b>AM</b> o <b>PM</b> para agregar</span></div>
    <div id="plist"></div>
    <div class="planbar"><p id="resumen"></p><button class="btn" id="agregar" disabled>Agregar</button></div>
  </main>`;
  window.scrollTo(0, 0); // empieza arriba aunque la semana estuviera desplazada
  C.bindTopbar(null);

  const paint = () => {
    document.getElementById('ciudades').innerHTML = ciudades.map((c) => `<button data-c="${C.esc(c)}" aria-pressed="${c === st.ciudad}">${ciudadNice(c)}</button>`).join('');
    // Sin búsqueda se ven los pendientes; al buscar aparece todo el panel de la ciudad (frecuencia 0 y visitas extra).
    const visible = (p) => p.ciudad === st.ciudad && (st.q.trim() ? true : p.pendiente > 0 && !p.en_fecha);
    const insts = [...new Set(a.personas.filter(visible).map((p) => p.institucion))].sort();
    if (st.inst && !insts.includes(st.inst)) st.inst = '';
    document.getElementById('inst').innerHTML =
      `<option value="">Todas las instituciones</option>` +
      insts.map((i) => `<option value="${C.esc(i)}" ${i === st.inst ? 'selected' : ''}>${C.esc(nice(i))} · ${a.personas.filter((p) => visible(p) && p.institucion === i).length}</option>`).join('');
    const q = norm(st.q);
    const match = (...xs) => !q || xs.some((x) => norm(x).includes(q));
    const abc = (x, y) => x.nombre.localeCompare(y.nombre, 'es', { sensitivity: 'base' });
    const fs = a.farmacias.filter((f) => f.ciudad === st.ciudad && match(f.nombre)).sort(abc);
    const ps = a.personas.filter((p) => visible(p) && (!st.inst || p.institucion === st.inst) && match(p.nombre, p.esp, p.institucion)).sort(abc);
    const prow = (key, tipo, nombre, sub, nota, ya) => {
      const s = st.sel.get(key);
      return `<div class="prow2 ${s ? 'on' : ''} ${tipo === 'farmacia' ? 'f' : ''}">
        <div class="pm"><b>${C.esc(nice(nombre))}</b><span>${sub}</span>${nota ? `<em>${C.esc(nota)}</em>` : ''}</div>
        ${
          ya
            ? '<span class="ya">Ya está</span>'
            : `<div class="ampm" role="group" aria-label="Franja para ${C.esc(nice(nombre))}"><button data-k="${key}" data-fr="AM" aria-pressed="${s === 'AM'}">AM</button><button data-k="${key}" data-fr="PM" aria-pressed="${s === 'PM'}">PM</button></div>`
        }
      </div>`;
    };
    document.getElementById('plist').innerHTML =
      (fs.length ? `<h3 class="ph">Farmacias</h3><div class="pcard">${fs.map((f) => prow('f' + f.id, 'farmacia', f.nombre, `${f.hechas} visita${f.hechas === 1 ? '' : 's'} este ciclo`, f.nota, f.en_fecha)).join('')}</div>` : '') +
      `<h3 class="ph">Contactos <span>${ps.length}${st.q.trim() ? '' : ' pendientes'}</span></h3>` +
      (ps.length
        ? `<div class="pcard">${ps.map((p) => prow('p' + p.id, 'persona', p.nombre, `${C.esc(p.esp)} · ${C.esc(nice(p.institucion))} · ${p.hechas} de ${p.frecuencia}`, p.nota, p.en_fecha)).join('')}</div>`
        : `<div class="empty">${st.q ? 'Nadie coincide con la búsqueda.' : 'No hay pendientes aquí. Para una visita extra, busca a la persona por nombre.'}</div>`);
    const am = [...st.sel.values()].filter((x) => x === 'AM').length, pm = st.sel.size - am;
    const nc = a.dia.contactos + [...st.sel.keys()].filter((k) => k[0] === 'p').length;
    const nf = a.dia.farmacias + [...st.sel.keys()].filter((k) => k[0] === 'f').length;
    document.getElementById('resumen').innerHTML = st.sel.size
      ? `Mañana <b>${am}</b> · Tarde <b>${pm}</b> · el ${nombreDia} quedaría con ${nc} contacto${nc === 1 ? '' : 's'} y ${nf} farmacia${nf === 1 ? '' : 's'}`
      : 'Elige contactos o farmacias';
    const btn = document.getElementById('agregar');
    btn.disabled = !st.sel.size;
    btn.textContent = st.sel.size ? `Agregar ${st.sel.size} al ${nombreDia}` : 'Agregar';
  };
  paint();
  C.app.querySelector('.plan').addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]');
    if (c) {
      st.ciudad = c.dataset.c;
      st.inst = '';
      store.set('ciudad', st.ciudad);
      return paint();
    }
    const b = e.target.closest('[data-fr]');
    if (b) {
      const k = b.dataset.k;
      if (st.sel.get(k) === b.dataset.fr) st.sel.delete(k);
      else st.sel.set(k, b.dataset.fr);
      paint();
    }
  });
  document.getElementById('inst').onchange = (e) => {
    st.inst = e.target.value;
    paint();
  };
  const q = document.getElementById('q');
  const qclear = document.getElementById('qclear');
  q.oninput = () => {
    st.q = q.value;
    qclear.classList.toggle('hidden', !q.value);
    paint();
  };
  // Limpiar la búsqueda (iPhone no muestra la × propia del campo).
  qclear.onclick = (e) => {
    e.preventDefault();
    q.value = '';
    st.q = '';
    qclear.classList.add('hidden');
    paint();
    q.focus();
  };
  document.getElementById('agregar').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const items = [...st.sel.entries()].map(([k, franja]) => ({
      tipo: k[0] === 'f' ? 'farmacia' : 'persona',
      id: Number(k.slice(1)),
      franja,
      ...(k[0] === 'p' && st.inst ? { lugar: st.inst } : {}),
    }));
    try {
      const r = await C.api('POST', 'visits', { fecha, items });
      C.toast(`Agregamos ${r.agregadas} al ${nombreDia}`);
      C.go(back);
    } catch (err) {
      C.toast(err.message, true);
      btn.disabled = false;
    }
  };
}

// ---------- ciclos ----------
export async function renderCycles() {
  const list = await C.api('GET', 'cycles');
  const last = list[0];
  const sugerido = last ? { numero: last.numero + 1, fecha_inicio: addDays(last.fecha_fin, 1), fecha_fin: '' } : { numero: '', fecha_inicio: '', fecha_fin: '' };
  C.app.innerHTML = `<main class="visitas">
    ${C.topbar({ title: 'Semana', back: '#/' })}
    <div class="card">
      <h2>Ciclos</h2>
      <p class="sub">Número y fechas como los define el laboratorio. Los ciclos no pueden cruzarse.</p>
      ${
        list.length
          ? list.map((c) => `<div class="prow" data-id="${c.id}"><div><div class="t">Ciclo ${c.numero}</div><div class="s">${largo(c.fecha_inicio)} – ${largo(c.fecha_fin)}</div></div><div class="v num">${c.dias_habiles} días</div></div>`).join('')
          : '<div class="empty">Todavía no hay ciclos.</div>'
      }
    </div>
    <div class="card">
      <h2>Nuevo ciclo</h2>
      <form id="cform" novalidate>${cycleFields(sugerido)}<div class="formerr" id="ferr"></div>
      <div class="foot" style="margin-top:16px"><button class="btn" type="submit">Guardar ciclo</button></div></form>
    </div>
  </main>`;
  window.scrollTo(0, 0);
  C.bindTopbar(null);
  document.getElementById('cform').onsubmit = (e) => saveCycle(e, 'POST', 'cycles');
  C.app.querySelectorAll('.prow').forEach(
    (r) =>
      (r.onclick = () => {
        const c = list.find((x) => x.id === Number(r.dataset.id));
        const el = C.openSheet(`<h2>Editar ciclo ${c.numero}</h2><form id="ceform" novalidate>${cycleFields(c)}<div class="formerr" id="ferr"></div>
          <div class="foot"><button class="btn" type="submit">Guardar cambios</button><button class="btn secondary" type="button" data-close>Cancelar</button></div></form>`);
        el.querySelector('#ceform').onsubmit = (e) => saveCycle(e, 'PATCH', 'cycles/' + c.id);
      })
  );
}
const cycleFields = (c) => `
  <div class="field"><label for="c-num">Número del ciclo</label><input id="c-num" name="numero" inputmode="numeric" value="${C.esc(c.numero)}" required></div>
  <div class="grid2">
    <div class="field"><label for="c-ini">Fecha de inicio</label><input id="c-ini" name="fecha_inicio" type="date" value="${C.esc(c.fecha_inicio)}" required></div>
    <div class="field"><label for="c-fin">Fecha de fin</label><input id="c-fin" name="fecha_fin" type="date" value="${C.esc(c.fecha_fin)}" required></div>
  </div>`;
async function saveCycle(e, method, path) {
  e.preventDefault();
  const f = e.target;
  try {
    const c = await C.api(method, path, { numero: Number(f.numero.value), fecha_inicio: f.fecha_inicio.value, fecha_fin: f.fecha_fin.value });
    C.toast(`Ciclo ${c.numero} guardado · ${c.dias_habiles} días hábiles`);
    C.closeSheet();
    reload();
  } catch (err) {
    f.querySelector('#ferr').textContent = err.message;
  }
}

// ---------- reporte (fase 2) ----------
// Comentario y objetivo = texto fijo (marca, farmacia o "Visita no efectiva") + lo que la usuaria dicta o escribe, ajustado por Claude.
// Al copiar el comentario el reporte queda listo. Todo se guarda solo mientras escribe.
const CAMPOS = {
  c: { key: 'comentario', nota: 'notas', label: 'Comentario', notaLabel: 'Tu comentario', ph: '¿Qué pasó en la visita? Dicta o escribe en tus palabras.', copiar: 'Copiar comentario' },
  o: { key: 'objetivo', nota: 'nota_objetivo', label: 'Objetivo', notaLabel: 'Agregar al objetivo', ph: '¿Algo más para la próxima visita? Dicta o escribe.', copiar: 'Copiar objetivo' },
};

export async function renderReporte(id) {
  const v = await C.api('GET', 'visits/' + id);
  const back = `#/semana/${lunesDe(v.fecha)}/${v.fecha}`;
  const hoy = (await C.api('GET', 'week?lunes=' + lunesDe(v.fecha))).hoy;
  const st = {
    tab: store.get('reptab:' + v.id, 'c'),
    marca: v.marca || v.marca_sugerida || null,
    meds: v.medicamentos,
    notas: { c: v.notas, o: v.nota_objetivo },
    texto: { c: v.comentario, o: v.objetivo },
    editando: { c: !v.comentario, o: !v.objetivo },
    grabando: null,
  };
  const ne = v.resultado === 'no_efectiva';
  // Si cambió entre realizada y no efectiva después de generar, el texto guardado ya no sirve: se vuelve a generar.
  if (v.comentario && ne !== v.comentario.startsWith('Visita no efectiva')) st.editando = { c: true, o: true };
  const cuando = (v.fecha === hoy ? 'Hoy, ' + largo(v.fecha).toLowerCase() : largo(v.fecha)) + ' · ' + v.franja;
  const [chipLabel, chipCls] = ESTADO[v.estado];
  const futura = v.fecha > hoy;

  C.app.innerHTML = `<main class="visitas reporte">
    ${C.topbar({ title: 'Reporte', back, menu: false })}
    <header class="rhead">
      <h1>${C.esc(nice(v.nombre))}</h1>
      <p>${v.tipo === 'farmacia' ? 'Farmacia · ' + C.esc(ciudadNice(v.ciudad)) : C.esc(v.esp + ' · ' + nice(v.lugar))}</p>
      <p class="rwhen"><span>${C.esc(cuando)}</span>${chipLabel ? `<button class="schip ${chipCls}" id="rchip">${chipLabel} ▾</button>` : ''}</p>
    </header>
    ${
      futura
        ? `<div class="banner info"><span>Esta visita es del ${largo(v.fecha).toLowerCase()}. El reporte se hace ese día.</span></div>`
        : `<section class="card rsel" id="rsel"></section>
    <div class="seg rtabs" role="tablist" aria-label="Partes del reporte">
      <button role="tab" data-t="c">Comentario</button><button role="tab" data-t="o">Objetivo</button>
    </div>
    <section class="card rpanel" id="rpanel"></section>
    ${v.reporte_listo ? '' : '<div class="rdirecto"><button class="linkbtn" id="rtablet">Lo reporté directo en la tablet</button><p>Solo si no copiaste el comentario desde aquí. Al copiar, el reporte queda listo solo.</p></div>'}`
    }
  </main>`;
  window.scrollTo(0, 0);
  C.bindTopbar(null);
  const chip = document.getElementById('rchip');
  if (chip) chip.onclick = () => openChipMenu(v, { hoy });
  if (futura) return;

  const datos = () => ({ tipo: v.tipo, resultado: v.resultado || 'realizada', marca: st.marca, medicamentos: st.meds });
  let tGuardar;
  const guardar = (inmediato) => {
    clearTimeout(tGuardar);
    const run = () =>
      C.api('PATCH', 'visits/' + v.id, {
        marca: v.tipo === 'persona' ? st.marca : undefined,
        medicamentos: v.tipo === 'farmacia' ? st.meds : undefined,
        notas: st.notas.c, nota_objetivo: st.notas.o, comentario: st.texto.c, objetivo: st.texto.o,
      }).catch((e) => C.toast(e.message, true));
    if (inmediato) return run();
    tGuardar = setTimeout(run, 700);
  };
  // Al cambiar la marca o los medicamentos se rehacen los textos ya generados (la nota ya está ajustada).
  const rearmar = () => {
    const a = armar(datos(), st.notas.c, st.notas.o);
    for (const k of ['c', 'o']) if (!st.editando[k]) st.texto[k] = a[CAMPOS[k].key];
  };

  const paintSel = () => {
    const el = document.getElementById('rsel');
    if (ne) {
      el.innerHTML = `<p class="rnote">Visita no efectiva: el comentario empieza con "Visita no efectiva" y no lleva mensaje de marca.</p>`;
      return;
    }
    if (v.tipo === 'farmacia') {
      el.innerHTML = `<h3>Medicamentos en inventario</h3><div class="rchips" role="group" aria-label="Medicamentos">${MEDICAMENTOS.map(
        (m) => `<button data-med="${m}" aria-pressed="${st.meds.includes(m)}">${m}</button>`
      ).join('')}</div>`;
      return;
    }
    const sug = !v.marca && v.marca_sugerida ? '<span class="rsug">La de la última visita</span>' : '';
    el.innerHTML = `<h3>Marca ${sug}</h3><div class="rchips" role="radiogroup" aria-label="Marca">${[...MARCAS.map((m) => [m.id, m.nombre]), [SIN_MARCA, 'Sin marca']]
      .map(([k, n]) => `<button data-marca="${k}" role="radio" aria-checked="${st.marca === k}" aria-pressed="${st.marca === k}">${n}</button>`)
      .join('')}</div>`;
  };

  const paintPanel = () => {
    C.app.querySelectorAll('[data-t]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.t === st.tab));
      b.setAttribute('aria-selected', String(b.dataset.t === st.tab));
    });
    const k = st.tab, cfg = CAMPOS[k];
    const el = document.getElementById('rpanel');
    const falta = v.tipo === 'persona' && !ne && !st.marca;
    if (st.editando[k]) {
      const fijo = fijos(datos())[cfg.key];
      el.innerHTML = `
        ${fijo ? `<div class="rfijo"><span>Va primero</span><p>${C.esc(fijo)}</p></div>` : ''}
        <label class="rlabel" for="rnota">${cfg.notaLabel} <span>(opcional)</span></label>
        <textarea id="rnota" rows="5" placeholder="${cfg.ph}">${C.esc(st.notas[k])}</textarea>
        <div class="rrec" id="rrec">
          ${st.grabando ? `<button class="btn rec" id="rmic">${IC.stop} Detener · <span id="rtime">0:00</span></button>` : `<button class="btn secondary" id="rmic">${IC.mic} Dictar</button>`}
        </div>
        ${falta ? '<p class="falta">Elige la marca arriba (o "Sin marca").</p>' : ''}
        <button class="btn" id="rgen" ${falta || st.grabando ? 'disabled' : ''}>Generar ${cfg.label.toLowerCase()}</button>`;
      const ta = el.querySelector('#rnota');
      ta.oninput = () => {
        st.notas[k] = ta.value;
        guardar();
      };
      el.querySelector('#rmic').onclick = () => (st.grabando ? detener() : grabar());
      el.querySelector('#rgen').onclick = generar;
    } else {
      const n = st.texto[k].length;
      el.innerHTML = `
        ${st.notas[k] ? `<button class="rnotas" id="reditar"><span>Tus notas: ${C.esc(st.notas[k])}</span><b>Editar</b></button>` : `<button class="rnotas" id="reditar"><span>Sin notas tuyas</span><b>Agregar</b></button>`}
        <label class="sr" for="rtexto">${cfg.label}, editable</label>
        <textarea id="rtexto" rows="9">${C.esc(st.texto[k])}</textarea>
        <div class="rcount"><span>Puedes editarlo antes de copiar</span><span class="num ${n > LIMITE ? 'over' : ''}" id="rn">${n} / ${LIMITE}</span></div>
        <p class="rover ${n > LIMITE ? '' : 'hidden'}" id="rover">Pasa de ${LIMITE} caracteres. Revisa que la tablet lo reciba completo.</p>
        <button class="btn" id="rcopy" ${n ? '' : 'disabled'}>${C.ICON.copy} ${cfg.copiar}</button>`;
      const ta = el.querySelector('#rtexto');
      ta.oninput = () => {
        st.texto[k] = ta.value;
        const m = ta.value.length;
        el.querySelector('#rn').textContent = `${m} / ${LIMITE}`;
        el.querySelector('#rn').classList.toggle('over', m > LIMITE);
        el.querySelector('#rover').classList.toggle('hidden', m <= LIMITE);
        el.querySelector('#rcopy').disabled = !m;
        guardar();
      };
      el.querySelector('#reditar').onclick = () => {
        st.editando[k] = true;
        paintPanel();
      };
      el.querySelector('#rcopy').onclick = copiar;
    }
  };

  async function generar(e) {
    const k = st.tab, cfg = CAMPOS[k];
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = st.notas[k].trim() ? 'Ajustando tu texto…' : 'Generando…';
    try {
      if (st.notas[k].trim()) st.notas[k] = (await C.api('POST', 'compose', { texto: st.notas[k], campo: cfg.key })).texto;
      st.texto[k] = armar(datos(), st.notas.c, st.notas.o)[cfg.key];
      if (!st.texto[k]) {
        C.toast(k === 'o' ? 'No hay objetivo fijo para esta visita. Escribe o dicta uno.' : 'Escribe o dicta el comentario.', true);
        btn.disabled = false;
        btn.textContent = 'Generar ' + cfg.label.toLowerCase();
        return;
      }
      st.editando[k] = false;
      await guardar(true);
      paintPanel();
    } catch (err) {
      C.toast(err.message, true);
      btn.disabled = false;
      btn.textContent = 'Generar ' + cfg.label.toLowerCase();
    }
  }

  async function copiar() {
    const k = st.tab;
    await C.copyText(st.texto[k]);
    try {
      if (k === 'c' && !v.reporte_listo) {
        clearTimeout(tGuardar);
        const r = await C.api('POST', `visits/${v.id}/reporte`, {
          via: 'copia', marca: v.tipo === 'persona' ? st.marca : undefined, medicamentos: v.tipo === 'farmacia' ? st.meds : undefined,
          notas: st.notas.c, nota_objetivo: st.notas.o, comentario: st.texto.c, objetivo: st.texto.o,
        });
        Object.assign(v, r);
        const ch = document.getElementById('rchip');
        if (ch) {
          ch.className = 'schip green';
          ch.textContent = 'Reporte listo ▾';
          ch.onclick = () => openChipMenu(v, { hoy });
        }
        document.getElementById('rtablet')?.remove();
        C.toast('Comentario copiado. Pégalo en la tablet. Reporte listo.');
        st.tab = 'o';
        store.set('reptab:' + v.id, 'o');
        paintPanel();
        window.scrollTo(0, 0);
        return;
      }
      await guardar(true);
      C.toast(k === 'c' ? 'Comentario copiado.' : 'Objetivo copiado. Pégalo en la tablet.');
    } catch (err) {
      C.toast(err.message, true);
    }
  }

  // ----- dictado: graba WAV 16 kHz mono en el navegador (funciona igual en iPhone y computador) -----
  async function grabar() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      return C.toast('No pudimos usar el micrófono. Revisa el permiso del navegador o escribe la nota.', true);
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    proc.onaudioprocess = (ev) => chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
    src.connect(proc);
    proc.connect(ctx.destination);
    const t0 = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      const el = document.getElementById('rtime');
      if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 180) detener();
    }, 250);
    st.grabando = { stream, ctx, src, proc, chunks, timer };
    paintPanel();
  }
  async function detener() {
    const g = st.grabando;
    if (!g) return;
    st.grabando = null;
    clearInterval(g.timer);
    g.proc.disconnect();
    g.src.disconnect();
    g.stream.getTracks().forEach((t) => t.stop());
    const rate = g.ctx.sampleRate;
    await g.ctx.close();
    paintPanel();
    const rec = document.getElementById('rrec');
    if (rec) rec.innerHTML = '<p class="rwait">Convirtiendo a texto…</p>';
    try {
      const b64 = await aBase64(wav(bajar(g.chunks, rate, 16000), 16000));
      const { texto } = await C.api('POST', 'transcribe', b64, { raw: true, headers: { 'content-type': 'text/plain' } });
      if (!texto) C.toast('No se entendió el audio. Intenta de nuevo, más cerca del teléfono.', true);
      else {
        const k = st.tab;
        st.notas[k] = (st.notas[k].trim() ? st.notas[k].trim() + ' ' : '') + texto;
        guardar();
      }
    } catch (err) {
      C.toast(err.message, true);
    }
    paintPanel();
  }

  C.app.querySelectorAll('[data-t]').forEach(
    (b) =>
      (b.onclick = () => {
        if (st.grabando) return C.toast('Detén el dictado antes de cambiar de pestaña.');
        st.tab = b.dataset.t;
        store.set('reptab:' + v.id, st.tab);
        paintPanel();
      })
  );
  document.getElementById('rsel').addEventListener('click', (e) => {
    const m = e.target.closest('[data-marca]');
    const d = e.target.closest('[data-med]');
    if (!m && !d) return;
    if (m) st.marca = m.dataset.marca;
    if (d) st.meds = st.meds.includes(d.dataset.med) ? st.meds.filter((x) => x !== d.dataset.med) : [...st.meds, d.dataset.med];
    const antes = { ...st.texto };
    rearmar();
    paintSel();
    paintPanel();
    guardar();
    if (antes.c !== st.texto.c || antes.o !== st.texto.o) C.toast('Actualizamos el texto con lo que elegiste.');
  });
  const tab = document.getElementById('rtablet');
  if (tab)
    tab.onclick = async () => {
      try {
        await guardar(true);
        await C.api('POST', `visits/${v.id}/reporte`, { via: 'tablet' });
        C.toast('Reporte marcado como listo.');
        C.go(back);
      } catch (err) {
        C.toast(err.message, true);
      }
    };
  // Si quedó una marca sugerida sin guardar, se guarda para que el texto y la marca coincidan.
  if (!v.marca && st.marca) guardar();
  paintSel();
  paintPanel();
}

// Promedia muestras para pasar de la frecuencia del micrófono (44,1/48 kHz) a 16 kHz.
function bajar(chunks, de, a) {
  const n = chunks.reduce((s, c) => s + c.length, 0);
  const all = new Float32Array(n);
  let o = 0;
  for (const c of chunks) all.set(c, o), (o += c.length);
  const r = de / a;
  const out = new Float32Array(Math.floor(n / r));
  for (let i = 0; i < out.length; i++) {
    const s = Math.floor(i * r), e = Math.min(n, Math.floor((i + 1) * r));
    let sum = 0;
    for (let j = s; j < e; j++) sum += all[j];
    out[i] = sum / Math.max(1, e - s);
  }
  return out;
}
function wav(muestras, rate) {
  const buf = new ArrayBuffer(44 + muestras.length * 2);
  const dv = new DataView(buf);
  const w = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + muestras.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, muestras.length * 2, true);
  for (let i = 0; i < muestras.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, muestras[i])) * 0x7fff, true);
  return new Blob([buf], { type: 'audio/wav' });
}
const aBase64 = (blob) =>
  new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = ko;
    fr.readAsDataURL(blob);
  });
