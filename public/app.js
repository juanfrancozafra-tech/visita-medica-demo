// Registro de gastos — frontend (sin dependencias; pdf-lib se carga solo al descargar el PDF).
// El módulo de visitas vive en visitas.js y solo se muestra si la API dice visitas: true (VISITAS_ON).
import { setupVisitas, renderWeek, renderPlan, renderCycles, renderReporte } from './visitas.js';
const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const state = { config: null, periodoAbierto: null, visitas: false, demo: false, sort: 'fecha-asc', q: '' };
// Inicio de gastos: con visitas encendidas, el inicio de la app es la semana y gastos pasa a #/gastos.
const HOME_G = () => (state.visitas ? '#/gastos' : '#/');

// ---------- utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CO');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fdate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
};
const todayCol = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }); // AAAA-MM-DD
const digits = (s) => String(s ?? '').replace(/\D/g, '');
const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();

const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.3" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};

let toastTimer;
function toast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), isErr ? 5000 : 3200);
}

async function api(method, path, body, opts = {}) {
  const init = { method, headers: { ...(opts.headers || {}) }, credentials: 'same-origin' };
  if (body !== undefined) {
    if (opts.raw) init.body = body;
    else {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  let res;
  try {
    res = await fetch('/api/' + path, init);
  } catch {
    throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
  if (res.status === 401 && path !== 'login') {
    closeSheet();
    renderLogin();
    throw new Error('Tu sesión terminó. Ingresa tu PIN.');
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error((data && data.error) || 'Algo salió mal. Intenta de nuevo.');
  return data;
}

// ---------- navegación ----------
window.addEventListener('hashchange', () => render());
const go = (hash) => {
  if (location.hash === hash) render();
  else location.hash = hash;
};

async function boot() {
  app.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const me = await api('GET', 'me');
    state.config = me.config;
    state.periodoAbierto = me.periodoAbierto;
    state.visitas = !!me.visitas;
    state.demo = !!me.demo;
    demoBar();
    document.title = state.visitas ? 'Visitas y gastos' : 'Registro de gastos';
    render();
  } catch (e) {
    if (!document.querySelector('.login')) app.innerHTML = `<main><div class="card"><h2>No se pudo cargar</h2><p class="sub">${esc(e.message)}</p><div class="foot" style="margin-top:14px"><button class="btn" onclick="location.reload()">Reintentar</button></div></div></main>`;
  }
}

async function render() {
  closeSheet();
  if (!state.config) return boot();
  const h = location.hash.replace(/^#\/?/, '');
  const [view, id, sub] = h.split('/');
  try {
    if (state.visitas) {
      if (view === '' || view === 'semana') {
        tabs('semana');
        return await renderWeek(id, sub);
      }
      if (view === 'planear' && id) return tabs(null), await renderPlan(id);
      if (view === 'ciclos') return tabs('semana'), await renderCycles();
      if (view === 'reporte' && id) return tabs(null), await renderReporte(Number(id));
    }
    tabs(view === 'periodo' && sub === 'cerrar' ? null : 'gastos');
    if (view === 'periodos') return await renderPeriods();
    if (view === 'periodo' && id && sub === 'cerrar') return await renderCloseReview(Number(id));
    if (view === 'periodo' && id) return await renderPeriod(Number(id));
    const me = await api('GET', 'me');
    state.periodoAbierto = me.periodoAbierto;
    if (state.periodoAbierto) return await renderPeriod(state.periodoAbierto, true);
    return renderStart();
  } catch (e) {
    toast(e.message, true);
  }
}

// Navegación principal (solo con visitas): Semana · Gastos. Abajo en el celular, arriba en el computador.
const TAB_ICON = {
  semana: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  gastos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
};
function tabs(active) {
  document.querySelector('.tabbar')?.remove();
  document.body.classList.toggle('has-tabs', !!(state.visitas && active));
  if (!state.visitas || !active) return;
  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.setAttribute('aria-label', 'Secciones');
  nav.innerHTML = [['semana', 'Semana', '#/'], ['gastos', 'Gastos', '#/gastos']]
    .map(([k, l, href]) => `<a href="${href}" ${k === active ? 'aria-current="page"' : ''}>${TAB_ICON[k]}${l}</a>`)
    .join('');
  document.body.insertBefore(nav, app);
}

// ---------- versión demo ----------
// Franja arriba con el aviso de datos ficticios y el botón para volver a los datos de ejemplo.
function demoBar() {
  let bar = document.getElementById('demobar');
  if (!state.demo) return bar?.remove();
  if (bar) return bar.querySelector('button').classList.toggle('hidden', !state.config);
  bar = document.createElement('div');
  bar.id = 'demobar';
  bar.className = 'demobar';
  bar.innerHTML = `<span><b>Demo</b> · datos ficticios que se reinician cada día</span><button type="button">Reiniciar</button>`;
  document.body.prepend(bar);
  bar.querySelector('button').classList.toggle('hidden', !state.config);
  bar.querySelector('button').onclick = async () => {
    if (!confirm('¿Volver a los datos de ejemplo? Se borra lo que hayas agregado.')) return;
    try {
      await api('POST', 'demo/reset');
      toast('Listo: la demo volvió a los datos de ejemplo');
      state.q = '';
      go('#/');
    } catch (e) {
      toast(e.message, true);
    }
  };
}

// ---------- login ----------
function renderLogin() {
  state.config = null;
  demoBar();
  document.querySelector('.tabbar')?.remove();
  document.body.classList.remove('has-tabs');
  let pin = '';
  let busy = false;
  app.innerHTML = `
    <div class="login">
      <div class="logo">${ICON.wallet}</div>
      <h1 id="logintitle">Registro de gastos</h1>
      <p>Ingresa tu PIN</p>
      <p class="demopin hidden" id="demopin"></p>
      <div class="dots" id="dots"><i></i><i></i><i></i><i></i></div>
      <div class="pinerr" id="pinerr"></div>
      <div class="keypad" id="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}" aria-label="${n}">${n}</button>`).join('')}
        <span></span><button data-k="0" aria-label="0">0</button><button class="ghost" data-k="del" aria-label="Borrar">Borrar</button>
      </div>
    </div>`;
  api('GET', 'info')
    .then((i) => {
      if (!i || !i.demo || !document.getElementById('demopin')) return;
      state.demo = true;
      demoBar();
      document.getElementById('logintitle').textContent = 'Visitas y gastos';
      const el = document.getElementById('demopin');
      el.innerHTML = i.pin ? `Versión demo · PIN <b class="num">${esc(i.pin)}</b>` : 'Versión demo';
      el.classList.remove('hidden');
    })
    .catch(() => {});
  const dots = [...document.querySelectorAll('#dots i')];
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const press = async (k) => {
    if (busy) return;
    document.getElementById('pinerr').textContent = '';
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < 4) pin += k;
    paint();
    if (pin.length === 4) {
      busy = true;
      try {
        await api('POST', 'login', { pin });
        await boot();
      } catch (e) {
        document.getElementById('pinerr').textContent = e.message;
        const d = document.getElementById('dots');
        d.classList.remove('shake');
        void d.offsetWidth;
        d.classList.add('shake');
        pin = '';
        paint();
      } finally {
        busy = false;
      }
    }
  };
  document.getElementById('keypad').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) press(b.dataset.k);
  });
  const onKey = (e) => {
    if (!document.querySelector('.login')) return document.removeEventListener('keydown', onKey);
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', onKey);
}

// ---------- barra superior con menú ----------
function topbar({ title, back, menu = true, periodo = null }) {
  const items = [];
  if (periodo && periodo.estado === 'abierto') items.push(`<button data-m="editar">${ICON.edit} Editar período</button>`);
  if (state.visitas) items.push(`<button data-m="ciclos">${ICON.history} Ciclos de visitas</button>`);
  items.push(`<button data-m="periodos">${ICON.history} Períodos de gastos</button>`);
  items.push(`<button data-m="salir" class="danger">${ICON.logout} Cerrar sesión</button>`);
  return `
    <div class="topbar">
      ${back ? `<button class="back" data-back="${esc(back)}">${ICON.back}<span>${esc(title)}</span></button>` : `<h1>${esc(title)}</h1>`}
      ${menu ? `<div class="menu-wrap"><button class="iconbtn" id="menubtn" aria-label="Menú">${ICON.menu}</button><div class="menu hidden" id="menu">${items.join('')}</div></div>` : ''}
    </div>`;
}
function bindTopbar(periodo) {
  const b = app.querySelector('[data-back]');
  if (b) b.onclick = () => go(b.dataset.back);
  const mb = document.getElementById('menubtn');
  const menu = document.getElementById('menu');
  if (!mb) return;
  mb.onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) document.addEventListener('click', () => menu.classList.add('hidden'), { once: true });
  };
  menu.onclick = async (e) => {
    const m = e.target.closest('button')?.dataset.m;
    menu.classList.add('hidden');
    if (m === 'periodos') go('#/periodos');
    if (m === 'ciclos') go('#/ciclos');
    if (m === 'editar') openPeriodSheet(periodo);
    if (m === 'salir') {
      await api('POST', 'logout').catch(() => {});
      renderLogin();
    }
  };
}

// ---------- iniciar período ----------
function renderStart() {
  const hoy = todayCol();
  const [y, m] = hoy.split('-').map(Number);
  app.innerHTML = `<main>
    ${topbar({ title: 'Gastos' })}
    <div class="card">
      <h2>Inicia un período de reporte</h2>
      <p class="sub">Para registrar gastos necesitas un período abierto. Normalmente es uno por mes.</p>
      <form id="pform" novalidate>
        ${periodFields({ nombre: `${MESES_LARGO[m - 1]} ${y}`, fecha_inicio: hoy, saldo_inicial: state.config.saldoInicialDefault })}
        <div class="formerr" id="ferr"></div>
        <div class="foot" style="margin-top:18px"><button class="btn" type="submit">Iniciar período</button></div>
      </form>
    </div>
  </main>`;
  bindTopbar(null);
  bindMoney(app);
  document.getElementById('pform').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const p = await api('POST', 'periods', readPeriodForm(e.target));
      state.periodoAbierto = p.id;
      toast('Período iniciado');
      go(HOME_G());
    } catch (err) {
      document.getElementById('ferr').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  };
}

function periodFields(p) {
  return `
    <div class="field"><label for="f-nombre">Nombre del período</label><input id="f-nombre" name="nombre" value="${esc(p.nombre)}" required autocomplete="off"></div>
    <div class="grid2">
      <div class="field"><label for="f-fi">Fecha de inicio</label><input id="f-fi" name="fecha_inicio" type="date" value="${esc(p.fecha_inicio)}" required></div>
      <div class="field money"><label for="f-saldo">Saldo inicial</label><input id="f-saldo" name="saldo_inicial" data-money inputmode="numeric" value="${esc(Number(p.saldo_inicial).toLocaleString('es-CO'))}" required></div>
    </div>`;
}
const readPeriodForm = (f) => ({
  nombre: f.nombre.value.trim(),
  fecha_inicio: f.fecha_inicio.value,
  saldo_inicial: Number(digits(f.saldo_inicial.value)),
});

function openPeriodSheet(p) {
  const el = openSheet(`
    <h2>Editar período</h2>
    <form id="peform" novalidate>
      ${periodFields(p)}
      <div class="formerr" id="ferr"></div>
      <div class="foot"><button class="btn" type="submit">Guardar cambios</button><button class="btn secondary" type="button" data-close>Cancelar</button></div>
    </form>`);
  bindMoney(el);
  el.querySelector('#peform').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('PATCH', 'periods/' + p.id, readPeriodForm(e.target));
      toast('Período actualizado');
      render();
    } catch (err) {
      el.querySelector('#ferr').textContent = err.message;
    }
  };
}

// ---------- vista de período ----------
async function renderPeriod(id, isHome = false) {
  const p = await api('GET', 'periods/' + id);
  const abierto = p.estado === 'abierto';
  const pct = p.saldo_inicial > 0 ? (p.total / p.saldo_inicial) * 100 : 0;
  const level = p.disponible < 0 || pct >= 100 ? 'bad' : pct >= state.config.alertaPct ? 'warn' : '';
  const sinSoporte = p.gastos.filter((g) => !g.tiene_soporte).length;

  let alert = '';
  if (abierto && level === 'bad')
    alert = `<div class="alert bad">${ICON.warn}<div>${p.disponible < 0 ? `Superaste el saldo del período por <b class="num">${money(-p.disponible)}</b>.` : 'Llegaste al límite del saldo del período.'}</div></div>`;
  else if (abierto && level === 'warn')
    alert = `<div class="alert warn">${ICON.warn}<div>Ya usaste el ${Math.round(pct)}% del saldo. Te quedan <b class="num">${money(p.disponible)}</b>.</div></div>`;
  if (!abierto) alert += `<div class="alert info">${ICON.lock}<div>Período cerrado el ${fdate(p.closed_at)}. Para hacer cambios, reábrelo.${p.files_purged_at ? ' Los soportes ya se eliminaron (pasaron 2 meses del cierre).' : ''}</div></div>`;

  const actions = abierto
    ? `<div class="actions">
        <button class="action primary" data-a="scan"><span class="ic">${ICON.camera}</span>Escanear</button>
        <button class="action" data-a="manual"><span class="ic">${ICON.pen}</span>A mano</button>
        <button class="action" data-a="copy" ${p.gastos.length ? '' : 'disabled'}><span class="ic">${ICON.copy}</span>Copiar tabla</button>
        <button class="action" data-a="pdf" ${p.gastos.length ? '' : 'disabled'}><span class="ic">${ICON.pdf}</span>PDF</button>
      </div>`
    : `<div class="actions">
        <button class="action" data-a="copy" ${p.gastos.length ? '' : 'disabled'}><span class="ic">${ICON.copy}</span>Copiar tabla</button>
        <button class="action" data-a="pdf" ${p.gastos.length && !p.files_purged_at ? '' : 'disabled'}><span class="ic">${ICON.pdf}</span>PDF</button>
        <button class="action" data-a="reopen"><span class="ic">${ICON.unlock}</span>Reabrir</button>
      </div>`;

  app.innerHTML = `<main class="wide">
    ${isHome ? topbar({ title: 'Gastos', periodo: p }) : topbar({ title: 'Períodos', back: '#/periodos', periodo: p })}
    <div class="layout">
      <aside>
        <div class="card hero">
          <span class="period">${esc(p.nombre)} <span class="chip ${abierto ? 'open' : 'closed'}"><span class="dot"></span>${abierto ? 'Abierto' : 'Cerrado'}</span></span>
          <div class="label">Saldo disponible</div>
          <div class="balance num ${p.disponible < 0 ? 'neg' : ''}">${money(p.disponible)}</div>
          <div class="bar ${level}"><i style="width:${Math.min(100, pct).toFixed(1)}%"></i></div>
          <div class="barlabels num"><span>${Math.round(pct)}% del saldo usado</span><span>de ${money(p.saldo_inicial)}</span></div>
          <div class="stats">
            <div class="stat"><b class="num">${money(p.total)}</b><span>Total gastos</span></div>
            <div class="stat"><b class="num">${money(p.saldo_inicial)}</b><span>Saldo inicial</span></div>
            <div class="stat"><b class="num">${p.transacciones}</b><span>Transacciones</span></div>
          </div>
        </div>
        ${alert}
        ${actions}
        ${abierto && p.gastos.length ? `<button class="btn secondary" data-a="close" style="margin-bottom:14px">${ICON.lock} Cerrar período</button>` : ''}
      </aside>
      <section class="card">
        <div class="listhead"><h2>Gastos</h2>${sinSoporte ? `<span class="chip" style="background:var(--warn-soft);color:var(--warn)">${sinSoporte} sin soporte</span>` : ''}</div>
        <div class="tools">
          <label class="search">${ICON.search}<input type="search" id="q" placeholder="Buscar" value="${esc(state.q)}" aria-label="Buscar"></label>
          <select class="sort mobile-only" id="sort" aria-label="Ordenar">
            ${[['fecha-asc', 'Fecha ↑'], ['fecha-desc', 'Fecha ↓'], ['valor-desc', 'Mayor valor'], ['valor-asc', 'Menor valor'], ['proveedor-asc', 'Proveedor A-Z']].map(([v, l]) => `<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div id="list"></div>
      </section>
    </div>
    <input type="file" id="filein" accept="image/*,application/pdf" class="fileinput" tabindex="-1" aria-hidden="true">
    <input type="file" id="filedoc" accept="application/pdf" class="fileinput" tabindex="-1" aria-hidden="true">
  </main>`;
  bindTopbar(p);

  // número de ítem oficial = orden por fecha (el mismo del Excel y el PDF)
  p.gastos.forEach((g, i) => (g.item = i + 1));
  const paintList = () => (document.getElementById('list').innerHTML = listHtml(p));
  paintList();
  document.getElementById('q').oninput = (e) => {
    state.q = e.target.value;
    paintList();
  };
  document.getElementById('sort').onchange = (e) => {
    state.sort = e.target.value;
    paintList();
  };
  document.getElementById('list').onclick = (e) => {
    const th = e.target.closest('th[data-s]');
    if (th) {
      const k = th.dataset.s;
      state.sort = state.sort === `${k}-asc` ? `${k}-desc` : `${k}-asc`;
      return paintList();
    }
    const row = e.target.closest('[data-id]');
    if (row) openExpenseSheet(p, p.gastos.find((g) => g.id === Number(row.dataset.id)));
  };

  const filein = document.getElementById('filein');
  const filedoc = document.getElementById('filedoc');
  [filein, filedoc].forEach(
    (inp) =>
      (inp.onchange = () => {
        const f = inp.files[0];
        inp.value = '';
        if (f) openExpenseSheet(p, null, f);
      })
  );
  // En el celular, "Escanear" muestra primero "Elegir archivo": la usuaria escanea con CamScanner y sube el PDF.
  // (El menú nativo de iOS no deja cambiar su orden, por eso usamos uno propio.)
  const scan = () => {
    if (!matchMedia('(pointer: coarse)').matches) return filein.click();
    const el = openSheet(`
      <h2>Cargar factura</h2>
      <div class="picker">
        <label for="filedoc" role="button"><span class="ic">${ICON.pdf}</span><span><b>Elegir archivo</b><small>PDF guardado en Archivos (ej. desde CamScanner)</small></span></label>
        <label for="filein" role="button"><span class="ic">${ICON.camera}</span><span><b>Foto o fototeca</b><small>Tomar una foto o elegir una imagen</small></span></label>
      </div>
      <div class="foot"><button class="btn secondary" type="button" data-close>Cancelar</button></div>`);
    // Cada opción es un <label for> del input: el tap abre el selector de forma nativa, sin .click() desde JS
    // (algunas versiones de Safari en iOS ignoran ese .click() y no pasa nada). El menú se cierra después del tap.
    el.querySelectorAll('.picker label').forEach((b) => (b.onclick = () => setTimeout(closeSheet, 0)));
  };
  app.querySelectorAll('[data-a]').forEach(
    (b) =>
      (b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'scan') scan();
        if (a === 'manual') openExpenseSheet(p, null);
        if (a === 'copy') copyTable(p);
        if (a === 'pdf') downloadPdf(p, b);
        if (a === 'close') go(`#/periodo/${p.id}/cerrar`);
        if (a === 'reopen') {
          if (!confirm(`¿Reabrir "${p.nombre}"? Podrás editar y agregar gastos.`)) return;
          try {
            await api('POST', `periods/${p.id}/reopen`);
            state.periodoAbierto = p.id;
            toast('Período reabierto');
            go(HOME_G());
          } catch (e) {
            toast(e.message, true);
          }
        }
      })
  );
}

function sortedFiltered(p) {
  const q = state.q.trim().toLowerCase();
  let rows = p.gastos.slice();
  if (q) rows = rows.filter((g) => [g.proveedor, g.nit, g.factura, g.funcionario, g.motivo, String(g.valor), fdate(g.fecha)].join(' ').toLowerCase().includes(q));
  const [k, dir] = state.sort.split('-');
  const mul = dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const va = k === 'item' ? a.item : a[k];
    const vb = k === 'item' ? b.item : b[k];
    if (typeof va === 'number') return (va - vb) * mul || a.item - b.item;
    return String(va).localeCompare(String(vb), 'es') * mul || a.item - b.item;
  });
  return rows;
}

function listHtml(p) {
  if (!p.gastos.length) return `<div class="empty">Aún no hay gastos en este período.${p.estado === 'abierto' ? '<br>Toca <b>Escanear</b> para cargar tu primera factura.' : ''}</div>`;
  const rows = sortedFiltered(p);
  if (!rows.length) return '<div class="empty">Ningún gasto coincide con la búsqueda.</div>';
  const [k, dir] = state.sort.split('-');
  const th = (key, label, cls = '') => `<th data-s="${key}" class="${cls}">${label}${k === key ? `<span class="arr">${dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
  const total = rows.reduce((s, g) => s + g.valor, 0);
  return `
    <ul class="items mobile-only">
      ${rows
        .map(
          (g) => `<li class="item" data-id="${g.id}">
            <div class="avatar">${esc(initial(g.proveedor))}${g.tiene_soporte ? '' : '<span class="nofile" title="Sin soporte"></span>'}</div>
            <div style="min-width:0"><div class="t">${esc(g.proveedor)}</div><div class="s">${esc(g.funcionario)}</div></div>
            <div class="v num">${money(g.valor)}<small>${fdate(g.fecha)}</small></div>
          </li>`
        )
        .join('')}
    </ul>
    <div class="desktop-only" style="overflow-x:auto">
      <table class="grid">
        <thead><tr>${th('item', '#')}${th('fecha', 'Fecha')}${th('proveedor', 'Proveedor')}${th('nit', 'NIT')}${th('factura', 'Factura No.')}${th('funcionario', 'Funcionario atendido')}${th('valor', 'Valor', 'r')}<th>Soporte</th></tr></thead>
        <tbody>${rows
          .map(
            (g) => `<tr data-id="${g.id}"><td class="num muted">${g.item}</td><td class="num" style="white-space:nowrap">${fdate(g.fecha)}</td><td><b>${esc(g.proveedor)}</b></td><td class="num">${esc(g.nit)}</td><td class="num">${esc(g.factura)}</td><td>${esc(g.funcionario)}</td><td class="r num"><b>${money(g.valor)}</b></td><td>${g.tiene_soporte ? (g.file_type === 'application/pdf' ? 'PDF' : 'Foto') : '<span style="color:var(--warn)">Falta</span>'}</td></tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td colspan="6">${rows.length === p.gastos.length ? 'Total' : `Total (${rows.length} de ${p.gastos.length})`}</td><td class="r num">${money(total)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

// ---------- hoja inferior ----------
function openSheet(html) {
  sheetRoot.innerHTML = `<div class="overlay"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const ov = sheetRoot.firstElementChild;
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-close]')) closeSheet();
  });
  document.body.style.overflow = 'hidden';
  return ov.querySelector('.sheet');
}
function closeSheet() {
  sheetRoot.innerHTML = '';
  document.body.style.overflow = '';
}

function bindMoney(root) {
  root.querySelectorAll('[data-money]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const d = digits(inp.value);
      inp.value = d ? Number(d).toLocaleString('es-CO') : '';
    });
  });
}

// ---------- gasto: crear / editar ----------
async function openExpenseSheet(p, g, file = null) {
  const editable = p.estado === 'abierto';
  const isNew = !g;
  const v = g || { proveedor: '', nit: '', factura: '', fecha: todayCol(), motivo: state.config.motivoDefault, valor: '', funcionario: '' };
  let pending = null; // archivo nuevo listo para subir {blob, type, name}
  const ro = editable ? '' : 'readonly';

  const el = openSheet(`
    <h2>${isNew ? 'Nuevo gasto' : editable ? 'Editar gasto' : 'Detalle del gasto'}</h2>
    ${g ? `<p class="sub muted" style="margin-top:2px">Ítem ${g.item} del período</p>` : ''}
    <div id="filebox"></div>
    <form id="eform" novalidate>
      <div class="field"><label for="e-prov">Proveedor</label><input id="e-prov" name="proveedor" value="${esc(v.proveedor)}" ${ro} autocomplete="off" autocapitalize="characters"></div>
      <div class="grid2">
        <div class="field"><label for="e-nit">NIT</label><input id="e-nit" name="nit" value="${esc(v.nit)}" ${ro} inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="e-fac">Factura No.</label><input id="e-fac" name="factura" value="${esc(v.factura)}" ${ro} autocomplete="off" autocapitalize="characters"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="e-fecha">Fecha</label><input id="e-fecha" name="fecha" type="date" value="${esc(v.fecha)}" ${ro}></div>
        <div class="field money"><label for="e-valor">Valor</label><input id="e-valor" name="valor" data-money inputmode="numeric" placeholder="0" value="${v.valor ? esc(Number(v.valor).toLocaleString('es-CO')) : ''}" ${ro}></div>
      </div>
      <div class="field"><label for="e-func">Funcionario atendido</label><input id="e-func" name="funcionario" value="${esc(v.funcionario)}" ${ro} placeholder="Ej. Dra. Ana Pérez - Oncología" autocomplete="off"></div>
      <div class="field"><label for="e-mot">Motivo del gasto</label><textarea id="e-mot" name="motivo" rows="3" ${ro}>${esc(v.motivo)}</textarea></div>
      <div class="formerr" id="ferr"></div>
      <div class="foot">
        ${editable ? `<button class="btn" type="submit" id="save">${isNew ? 'Guardar gasto' : 'Guardar cambios'}</button>` : ''}
        <button class="btn secondary" type="button" data-close>${editable ? 'Cancelar' : 'Cerrar'}</button>
        ${editable && !isNew ? '<button class="btn danger" type="button" id="del">Eliminar gasto</button>' : ''}
      </div>
    </form>
    <input type="file" id="attach" accept="image/*,application/pdf" class="fileinput" tabindex="-1" aria-hidden="true">`);
  bindMoney(el);
  const form = el.querySelector('#eform');
  const filebox = el.querySelector('#filebox');

  const paintFile = (opts = {}) => {
    const thumb = pending
      ? pending.type === 'application/pdf'
        ? '<div class="pdf">PDF</div>'
        : `<img src="${pending.url}" alt="">`
      : g && g.tiene_soporte
        ? g.file_type === 'application/pdf'
          ? '<div class="pdf">PDF</div>'
          : `<img src="/api/expenses/${g.id}/file" alt="">`
        : '';
    const name = pending ? pending.name : g && g.tiene_soporte ? g.file_name || 'Soporte' : '';
    if (!thumb && !editable) {
      filebox.innerHTML = p.files_purged_at ? '' : '<div class="alert warn" style="margin:14px 0 0">' + ICON.warn + '<div>Este gasto no tiene soporte.</div></div>';
      return;
    }
    filebox.innerHTML = `<div class="preview">
      ${thumb || `<div class="pdf" style="color:var(--warn)">${ICON.warn}</div>`}
      <div class="meta">
        ${opts.reading ? '<div class="reading"><span class="spinner"></span>Leyendo la factura…</div>' : thumb ? `<b>${esc(name)}</b><span>${pending ? 'Se guardará con el gasto' : 'Soporte guardado'}</span>` : '<b>Sin soporte</b><span>Adjunta la foto o el PDF de la factura</span>'}
      </div>
      ${g && g.tiene_soporte && !pending ? `<a class="linkbtn" href="/api/expenses/${g.id}/file" target="_blank" rel="noopener">Ver</a>` : ''}
      ${editable && !opts.reading ? `<label class="linkbtn" for="attach" role="button" id="pick">${thumb ? 'Cambiar' : 'Adjuntar'}</label>` : ''}
    </div>
    ${opts.note ? `<div class="alert ${opts.noteLevel || 'info'}" style="margin:10px 0 0">${ICON.info}<div>${esc(opts.note)}</div></div>` : ''}`;
  };

  const useFile = async (f, extract) => {
    try {
      pending = await prepareFile(f);
    } catch (e) {
      toast(e.message, true);
      return;
    }
    paintFile({ reading: extract });
    if (!extract) return;
    try {
      const r = await api('POST', 'extract', pending.b64, { raw: true, headers: { 'content-type': pending.type } });
      const set = (name, val) => {
        if (val) form[name].value = val;
      };
      set('proveedor', r.proveedor);
      set('nit', r.nit);
      set('factura', r.factura);
      set('fecha', r.fecha);
      if (r.valor) form.valor.value = Number(r.valor).toLocaleString('es-CO');
      const faltan = ['proveedor', 'nit', 'factura', 'fecha', 'valor'].filter((k) => !form[k].value);
      let note = 'Revisa que los datos coincidan con la factura antes de guardar.';
      if (faltan.length) note = 'No se pudieron leer todos los datos. Completa los campos vacíos. ';
      if (r.notas) note += ' ' + r.notas;
      if (r.fecha_revisar) form.fecha.closest('.field').classList.add('err');
      paintFile({ note, noteLevel: faltan.length || r.fecha_revisar ? 'warn' : 'info' });
      if (!form.funcionario.value) form.funcionario.focus({ preventScroll: true });
    } catch (e) {
      paintFile({ note: e.message, noteLevel: 'warn' });
    }
  };
  el.querySelector('#attach').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) useFile(f, isNew && !form.proveedor.value);
  };
  paintFile();
  if (file) useFile(file, true);

  if (!editable) return;
  let fechaAvisada = '';
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = el.querySelector('#save');
    const body = {
      proveedor: form.proveedor.value.trim(),
      nit: form.nit.value.trim(),
      factura: form.factura.value.trim(),
      fecha: form.fecha.value,
      motivo: form.motivo.value.trim(),
      valor: Number(digits(form.valor.value)),
      funcionario: form.funcionario.value.trim(),
    };
    const req = { proveedor: 'Proveedor', nit: 'NIT', factura: 'Factura No.', fecha: 'Fecha', valor: 'Valor', funcionario: 'Funcionario atendido', motivo: 'Motivo del gasto' };
    const faltan = Object.keys(req).filter((k) => !body[k]);
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('err'));
    faltan.forEach((k) => form[k].closest('.field').classList.add('err'));
    if (faltan.length) {
      el.querySelector('#ferr').textContent = 'Completa: ' + faltan.map((k) => req[k]).join(', ') + '.';
      return;
    }
    // Fecha rara (futura o de hace más de 60 días): se avisa una vez; al volver a tocar Guardar, guarda.
    const hoy = todayCol();
    const dias = (Date.parse(hoy) - Date.parse(body.fecha)) / 86400000;
    if ((dias < -1 || dias > 60) && fechaAvisada !== body.fecha) {
      fechaAvisada = body.fecha;
      form.fecha.closest('.field').classList.add('err');
      el.querySelector('#ferr').textContent = `¿La fecha es ${fdate(body.fecha)}? Está lejos de hoy. Si es correcta, toca Guardar otra vez.`;
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-color:#555;border-top-color:#fff"></span> Guardando…';
    let id = g && g.id;
    try {
      if (isNew) id = (await api('POST', 'expenses', body)).id;
      else await api('PATCH', 'expenses/' + id, body);
    } catch (err) {
      el.querySelector('#ferr').textContent = err.message;
      btn.disabled = false;
      btn.textContent = isNew ? 'Guardar gasto' : 'Guardar cambios';
      return;
    }
    if (pending) {
      try {
        await api('PUT', `expenses/${id}/file`, pending.blob, { raw: true, headers: { 'content-type': pending.type, 'x-file-name': encodeURIComponent(pending.name) } });
      } catch (err) {
        toast('El gasto se guardó, pero el soporte no se pudo subir. Ábrelo y vuelve a adjuntarlo.', true);
        return render();
      }
    }
    toast(isNew ? 'Gasto guardado' : 'Cambios guardados');
    render();
  };
  const del = el.querySelector('#del');
  if (del)
    del.onclick = async () => {
      if (!confirm(`¿Eliminar el gasto de ${g.proveedor} por ${money(g.valor)}?`)) return;
      try {
        await api('DELETE', 'expenses/' + g.id);
        toast('Gasto eliminado');
        render();
      } catch (e) {
        toast(e.message, true);
      }
    };
}

// Prepara el archivo: las fotos se reducen y pasan a JPG (también convierte las HEIC del iPhone).
async function prepareFile(f) {
  const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
  if (isPdf) {
    const mb = state.config?.maxFileMb || 15;
    if (f.size > mb * 1024 * 1024) throw new Error(`El PDF es muy grande (máximo ${mb} MB).`);
    return { blob: f, type: 'application/pdf', name: f.name, b64: await toBase64(f) };
  }
  let bmp;
  try {
    bmp = await loadImage(f);
  } catch {
    throw new Error('No se pudo abrir la imagen. Usa una foto JPG o PNG, o un PDF.');
  }
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  const name = (f.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
  return { blob, type: 'image/jpeg', name, url: URL.createObjectURL(blob), b64: await toBase64(blob) };
}
function loadImage(f) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(f);
  });
}
function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// ---------- copiar tabla para la hoja de legalización ----------
// 16 columnas: las vacías corresponden a celdas combinadas del Excel, así el pegado cae exacto desde "Item".
function tableTsv(p) {
  const c = state.config;
  const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  return p.gastos
    .map((g, i) =>
      [i + 1, g.proveedor, g.nit, '', g.factura, '', g.fecha, g.motivo, c.ceco, c.cuenta, g.valor, g.funcionario, '', c.empresa, '', c.funcionariosEmpresa]
        .map(clean)
        .join('\t')
    )
    .join('\n');
}
async function copyTable(p) {
  await copyText(tableTsv(p));
  toast(`Copiamos ${p.gastos.length} filas. Pégalas en la primera celda de "Item" del Excel.`);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// ---------- PDF con todos los soportes ----------
let pdfLibPromise;
const loadPdfLib = () =>
  (pdfLibPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/pdf-lib.min.js';
    s.onload = () => resolve(window.PDFLib);
    s.onerror = () => reject(new Error('No se pudo cargar el generador de PDF.'));
    document.head.appendChild(s);
  }));

async function downloadPdf(p, btn) {
  const conSoporte = p.gastos.filter((g) => g.tiene_soporte);
  if (!conSoporte.length) return toast('Ningún gasto tiene soporte todavía.', true);
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.querySelector('.ic').innerHTML = '<span class="spinner"></span>';
  try {
    const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const A4 = [595.28, 841.89];
    for (const g of p.gastos) {
      if (!g.tiene_soporte) continue;
      const res = await fetch(`/api/expenses/${g.id}/file`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`No se pudo descargar el soporte de ${g.proveedor}.`);
      const bytes = await res.arrayBuffer();
      if (g.file_type === 'application/pdf') {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((pg) => out.addPage(pg));
      } else {
        const img = g.file_type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
        const page = out.addPage(A4);
        const m = 28;
        const s = Math.min((A4[0] - m * 2) / img.width, (A4[1] - m * 2 - 18) / img.height);
        const w = img.width * s;
        const h = img.height * s;
        page.drawImage(img, { x: (A4[0] - w) / 2, y: A4[1] - m - h, width: w, height: h });
        const cap = `Ítem ${g.item} · ${g.proveedor} · Factura ${g.factura} · ${money(g.valor)}`.replace(/[^\x20-\xFF]/g, '');
        page.drawText(cap, { x: m, y: 16, size: 8, font, color: rgb(0.45, 0.47, 0.52) });
      }
    }
    const blob = new Blob([await out.save()], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Soportes - ${p.nombre}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    const faltan = p.gastos.length - conSoporte.length;
    toast(faltan ? `PDF listo. ${faltan} gasto(s) sin soporte no se incluyeron.` : 'PDF listo con todos los soportes.', !!faltan);
  } catch (e) {
    toast(e.message || 'No se pudo generar el PDF.', true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

// ---------- revisión antes de cerrar ----------
async function renderCloseReview(id) {
  const p = await api('GET', 'periods/' + id);
  if (p.estado !== 'abierto') return go('#/periodo/' + id);
  const sinSoporte = p.gastos.filter((g) => !g.tiene_soporte);
  app.innerHTML = `<main>
    ${topbar({ title: 'Volver', back: HOME_G(), menu: false })}
    <div class="card">
      <h2>Revisa antes de cerrar</h2>
      <p class="sub">${esc(p.nombre)} · desde ${fdate(p.fecha_inicio)}</p>
      <div style="margin-top:14px">
        <div class="review-row"><span>Transacciones</span><b class="num">${p.transacciones}</b></div>
        <div class="review-row"><span>Total gastos</span><b class="num">${money(p.total)}</b></div>
        <div class="review-row"><span>Saldo inicial</span><b class="num">${money(p.saldo_inicial)}</b></div>
        <div class="review-row"><span>Saldo disponible</span><b class="num" style="${p.disponible < 0 ? 'color:var(--bad)' : ''}">${money(p.disponible)}</b></div>
      </div>
    </div>
    ${sinSoporte.length ? `<div class="alert warn">${ICON.warn}<div>${sinSoporte.length} gasto(s) no tienen soporte: ${sinSoporte.map((g) => esc(g.proveedor)).join(', ')}. No aparecerán en el PDF.</div></div>` : ''}
    ${p.disponible < 0 ? `<div class="alert bad">${ICON.warn}<div>El período quedó ${money(-p.disponible)} por encima del saldo.</div></div>` : ''}
    <div class="card">
      <h2 style="margin-bottom:8px">Gastos</h2>
      ${p.gastos.map((g, i) => `<div class="review-row"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:10px"><span class="muted num">${i + 1}.</span> ${esc(g.proveedor)} <span class="muted">· ${fdate(g.fecha)}</span></span><b class="num">${money(g.valor)}</b></div>`).join('')}
    </div>
    <p class="sub muted" style="margin:0 4px 14px">Al cerrar, el período queda bloqueado. Podrás copiar la tabla, descargar el PDF o reabrirlo cuando lo necesites.</p>
    <button class="btn" id="confirm">${ICON.lock} Confirmar cierre</button>
  </main>`;
  bindTopbar(null);
  document.getElementById('confirm').onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api('POST', `periods/${id}/close`);
      state.periodoAbierto = null;
      toast('Período cerrado');
      go('#/periodo/' + id);
    } catch (err) {
      toast(err.message, true);
      e.currentTarget.disabled = false;
    }
  };
}

// ---------- períodos anteriores ----------
async function renderPeriods() {
  const list = await api('GET', 'periods');
  app.innerHTML = `<main>
    ${topbar({ title: 'Gastos', back: HOME_G() })}
    <div class="card">
      <h2 style="margin-bottom:6px">Períodos</h2>
      ${list.length ? list.map((p) => `<div class="prow" data-id="${p.id}">
          <div><div class="t">${esc(p.nombre)}</div><div class="s">${p.transacciones} gasto(s) · desde ${fdate(p.fecha_inicio)}${p.closed_at ? ' · cerrado ' + fdate(p.closed_at) : ''}</div></div>
          <div class="v"><div class="num">${money(p.total)}</div><span class="chip ${p.estado === 'abierto' ? 'open' : 'closed'}" style="margin-top:4px"><span class="dot"></span>${p.estado === 'abierto' ? 'Abierto' : 'Cerrado'}</span></div>
        </div>`).join('') : '<div class="empty">Todavía no hay períodos.</div>'}
    </div>
  </main>`;
  bindTopbar(null);
  app.querySelectorAll('.prow').forEach((r) => (r.onclick = () => go('#/periodo/' + r.dataset.id)));
}

setupVisitas({ app, api, esc, toast, go, openSheet, closeSheet, topbar, bindTopbar, copyText, ICON });
boot();
