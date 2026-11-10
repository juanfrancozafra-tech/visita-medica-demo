// Modo demo (versión de portafolio): datos ficticios que se reinician cada día y respuestas de IA simuladas.
// Se enciende con DEMO_MODE = "1" en wrangler.toml. Con "0" la app funciona igual que la versión real.
// Todo lo de aquí es inventado: personas, instituciones, farmacias, proveedores, NIT y facturas.
import { HttpError } from './extract.js';
import { hoyBogota, addDays, esHabil } from './fechas.js';
import { MARCAS, armar } from '../public/marcas.js';
import { normalizar } from './redactar.js';
import { CONFIG } from './config.js';

export const demoOn = (env) => String(env.DEMO_MODE || '') === '1';
export const DEMO_MAX_FILE_MB = 3;

// ---------- utilidades ----------
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (tabla, cols, rows) => `INSERT INTO ${tabla} (${cols.join(',')}) VALUES ${rows.map((r) => '(' + r.map(q).join(',') + ')').join(',')}`;
// Generador pseudoaleatorio con semilla: los mismos datos cada vez que se reinicia el mismo día.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const habilesHasta = (desde, n, paso) => {
  const out = [];
  let d = desde;
  while (out.length < n) {
    d = addDays(d, paso);
    if (esHabil(d)) out.push(d);
  }
  return out;
};

// ---------- panel ficticio ----------
const NOMBRES = ['ANA MARIA', 'CARLOS', 'LUISA', 'JORGE', 'PAULA', 'ANDRES', 'CAMILA', 'FELIPE', 'DIANA', 'MAURICIO', 'NATALIA', 'RICARDO', 'VALERIA', 'SERGIO', 'MONICA', 'JULIAN', 'ADRIANA', 'GUSTAVO', 'CATALINA', 'HERNAN'];
const APELLIDOS = ['PEREZ', 'GOMEZ', 'RUIZ', 'TORRES', 'MORALES', 'CASTRO', 'ORTIZ', 'VARGAS', 'ROJAS', 'MEDINA', 'SUAREZ', 'MEJIA', 'ARANGO', 'PINEDA', 'SALAZAR', 'OSORIO', 'CARDONA', 'BETANCUR', 'QUINTERO', 'ACOSTA'];
const FEMENINOS = new Set(['ANA', 'LUISA', 'PAULA', 'CAMILA', 'DIANA', 'NATALIA', 'VALERIA', 'MONICA', 'ADRIANA', 'CATALINA']);
const ESP_LARGA = { ONC: 'Oncología', HEM: 'Hematología', URO: 'Urología', MI: 'Medicina interna', CIR: 'Cirugía', ANE: 'Anestesiología', UCI: 'Cuidado intensivo', GIN: 'Ginecología', ORT: 'Ortopedia', NEU: 'Neurología' };
const ESP = ['ONC', 'HEM', 'URO', 'MI', 'CIR', 'ANE', 'UCI', 'GIN', 'ORT', 'NEU'];
const INSTITUCIONES = {
  CALI: ['CLINICA LOS ANDES', 'HOSPITAL SANTA LUCIA', 'CENTRO MEDICO EL PRADO', 'IPS VIDA PLENA', 'CLINICA NUEVA AURORA'],
  PALMIRA: ['HOSPITAL SAN ROQUE', 'CLINICA PALMA REAL', 'IPS SALUD DEL SUR'],
};
const FARMACIAS = {
  CALI: ['FARMACIA CLINICA LOS ANDES', 'FARMACIA HOSPITAL SANTA LUCIA', 'DROGUERIA EL PRADO', 'FARMACIA IPS VIDA PLENA', 'DROGUERIA AURORA', 'FARMACIA CENTRAL NORTE', 'DROGUERIA SAN FERNANDO', 'FARMACIA ONCOLOGICA DEL VALLE', 'DROGUERIA GRANADA', 'FARMACIA SAN ANTONIO'],
  PALMIRA: ['FARMACIA HOSPITAL SAN ROQUE', 'DROGUERIA PALMA REAL', 'FARMACIA SALUD DEL SUR', 'DROGUERIA LA PLAZA'],
};

// ---------- proveedores ficticios (gastos y lectura simulada de facturas) ----------
const PROVEEDORES = [
  { proveedor: 'CAFÉ DEL PARQUE SAS', nit: '901000101', pref: 'FECP' },
  { proveedor: 'PANADERÍA LA ESPIGA SAS', nit: '901000202', pref: 'PLE' },
  { proveedor: 'RESTAURANTE EL FOGÓN DEL VALLE SAS', nit: '901000303', pref: 'FEFV' },
  { proveedor: 'TOSTADORES DEL SUR SAS - CAFÉ ALTURA', nit: '901000404', pref: 'TS' },
  { proveedor: 'COCINA DE LA ABUELA SAS', nit: '901000505', pref: 'FECA' },
  { proveedor: 'BISTRÓ LA TERRAZA SAS', nit: '901000606', pref: 'BLT' },
];
const VALORES = [18500, 24900, 32400, 37400, 45800, 52300, 61200, 74500, 86900, 98400];

// ---------- PDF mínimo para los soportes de ejemplo ----------
// Una página con texto (Helvetica). Se arma a mano para no agregar dependencias en el servidor.
function pdfSoporte(lineas) {
  const latin1 = (s) => s.replace(/[^\x20-\xFF]/g, '?');
  const esc = (s) => latin1(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const texto = lineas.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 60 ${760 - i * 22} Td (${esc(l)}) Tj ET`).join('\n');
  const marco = '0.85 G 40 560 515 240 re S';
  const contenido = marco + '\n' + texto;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
const peso = (n) => '$' + n.toLocaleString('es-CO').replace(/,/g, '.');

// ---------- siembra ----------
export async function seedDemo(env, db) {
  const hoy = hoyBogota();
  const r = rng(Number(hoy.replace(/-/g, '')));
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const t = new Date().toISOString();

  // Ciclo actual: hoy es el día 12 de 20 hábiles. El anterior termina justo antes.
  const antes = habilesHasta(hoy, 11, -1).reverse(); // 11 días hábiles antes de hoy
  const inicio = esHabil(hoy) ? antes[0] : antes[1];
  const habCiclo = [inicio, ...habilesHasta(inicio, 19, 1)];
  const fin = habCiclo[19];
  const prevFin = addDays(inicio, -1);
  const prevIni = habilesHasta(inicio, 20, -1).pop();

  // Panel: 100 contactos (frecuencia 1 o 2), dos ciudades.
  const people = [];
  for (let i = 0; i < 100; i++) {
    const ciudad = i < 70 ? 'CALI' : 'PALMIRA';
    const nombre = `${APELLIDOS[i % 20]} ${APELLIDOS[(i * 7 + 3) % 20]} ${NOMBRES[(i * 3 + Math.floor(i / 20)) % 20]}`;
    people.push({ id: i + 1, nombre, esp: ESP[(i * 3) % ESP.length], institucion: INSTITUCIONES[ciudad][i % INSTITUCIONES[ciudad].length], ciudad, frecuencia: i % 5 === 0 ? 1 : 2 });
  }
  const pharm = [];
  for (const ciudad of Object.keys(FARMACIAS)) for (const nombre of FARMACIAS[ciudad]) pharm.push({ id: pharm.length + 1, nombre, ciudad });

  // Visitas: días pasados del ciclo (casi todo con reporte), hoy (parte hecha) y los próximos dos días hábiles planeados.
  const visits = [];
  const usados = new Map(people.map((p) => [p.id, 0]));
  let cursor = 0;
  const siguientePersona = (fecha, ciudad) => {
    for (let k = 0; k < people.length; k++) {
      const p = people[(cursor + k) % people.length];
      if (p.ciudad !== ciudad || usados.get(p.id) >= p.frecuencia) continue;
      if (visits.some((v) => v.person_id === p.id && v.fecha === fecha)) continue;
      cursor = (cursor + k + 1) % people.length;
      usados.set(p.id, usados.get(p.id) + 1);
      return p;
    }
    return null;
  };
  const marcaIds = MARCAS.map((m) => m.id);
  const NOTAS = ['el doctor comenta que tiene pacientes nuevos en tratamiento.', 'solicita información de presentaciones disponibles.', 'refiere buena respuesta de los pacientes.', 'queda pendiente agendar charla con el servicio.', ''];
  const pasados = habCiclo.filter((d) => d < hoy);
  const futuros = habCiclo.filter((d) => d > hoy).slice(0, 2);
  const dias = [...pasados, ...(esHabil(hoy) ? [hoy] : []), ...futuros];
  let vid = 1;
  for (const fecha of dias) {
    const ciudad = new Date(fecha + 'T00:00:00Z').getUTCDay() === 3 ? 'PALMIRA' : 'CALI'; // los miércoles, Palmira
    const pasado = fecha < hoy, esHoy = fecha === hoy;
    const nC = pasado ? 8 + Math.floor(r() * 3) : esHoy ? 9 : 6; // contactos del día
    const nF = pasado ? 2 + Math.floor(r() * 2) : esHoy ? 3 : 2;
    const ayer = fecha === pasados[pasados.length - 1];
    for (let i = 0; i < nC; i++) {
      const p = siguientePersona(fecha, ciudad);
      if (!p) break;
      const franja = i < Math.ceil(nC / 2) ? 'AM' : 'PM';
      const v = { id: vid++, fecha, franja, orden: i, tipo: 'persona', person_id: p.id, pharmacy_id: null, lugar: p.institucion, resultado: null, marca: null, notas: null, comentario: null, objetivo: null, reporte_listo_at: null, reporte_via: null };
      if (pasado || (esHoy && franja === 'AM' && i < 3)) {
        const roll = r();
        if (pasado && roll < 0.05) {
          // no realizada: se queda sin resultado
        } else if (roll < 0.1) {
          v.resultado = 'no_efectiva';
          v.notas = 'El doctor estaba en cirugía.';
        } else {
          v.resultado = 'realizada';
          v.marca = pick(marcaIds);
          v.notas = normalizar(pick(NOTAS));
        }
        if (v.resultado) {
          const listo = !(ayer && i >= nC - 2); // ayer quedan 2 sin reporte (para ver el aviso)
          const txt = armar({ tipo: 'persona', resultado: v.resultado, marca: v.marca }, v.notas, '');
          if (listo) Object.assign(v, { comentario: txt.comentario, objetivo: txt.objetivo, reporte_listo_at: t, reporte_via: 'copia' });
        }
      }
      visits.push(v);
    }
    const farmCiudad = pharm.filter((f) => f.ciudad === ciudad);
    const offset = Math.floor(r() * farmCiudad.length);
    for (let i = 0; i < nF; i++) {
      const f = farmCiudad[(offset + i) % farmCiudad.length];
      const v = { id: vid++, fecha, franja: 'PM', orden: 20 + i, tipo: 'farmacia', person_id: null, pharmacy_id: f.id, lugar: f.nombre, resultado: null, marca: null, notas: null, comentario: null, objetivo: null, reporte_listo_at: null, reporte_via: null };
      if (pasado) {
        v.resultado = 'realizada';
        v.medicamentos = 'NOVACLOT,SEPTIVAN';
        const txt = armar({ tipo: 'farmacia', resultado: 'realizada', medicamentos: ['NOVACLOT', 'SEPTIVAN'] }, '', '');
        Object.assign(v, { comentario: txt.comentario, objetivo: txt.objetivo, reporte_listo_at: t, reporte_via: 'copia' });
      }
      visits.push(v);
    }
  }

  // Gastos: el mes pasado cerrado y el actual abierto (cerca del 80% del saldo, para ver el aviso amarillo).
  const MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const [y, m] = hoy.split('-').map(Number);
  const iniMes = `${y}-${String(m).padStart(2, '0')}-01`;
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const iniPrev = `${py}-${String(pm).padStart(2, '0')}-01`;
  const saldo = CONFIG.saldoInicialDefault;
  const periods = [
    { id: 1, nombre: `${MES[pm - 1]} ${py}`, fecha_inicio: iniPrev, saldo_inicial: saldo, estado: 'cerrado', closed_at: t },
    { id: 2, nombre: `${MES[m - 1]} ${y}`, fecha_inicio: iniMes, saldo_inicial: saldo, estado: 'abierto', closed_at: null },
  ];
  const expenses = [];
  const gastosDe = (period, desde, hasta, objetivo) => {
    let total = 0, n = 0;
    const span = Math.max(0, Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000));
    while (true) {
      const pr = PROVEEDORES[(expenses.length * 5) % PROVEEDORES.length];
      const caben = VALORES.filter((x) => total + x <= objetivo);
      if (!caben.length) break;
      const valor = caben[Math.floor(r() * caben.length)];
      const p = people[Math.floor(r() * people.length)];
      const nom = p.nombre.split(' ');
      const tc = (w) => w.charAt(0) + w.slice(1).toLowerCase();
      const id = expenses.length + 1;
      expenses.push({
        id, period_id: period, proveedor: pr.proveedor, nit: pr.nit, factura: `${pr.pref}${4000 + id * 37}`,
        fecha: addDays(desde, Math.min(span, Math.floor((n * span) / 8))),
        motivo: CONFIG.motivoDefault, valor, funcionario: `${FEMENINOS.has(nom[2]) ? 'Dra.' : 'Dr.'} ${tc(nom[2])} ${tc(nom[0])} - ${ESP_LARGA[p.esp]}`,
      });
      total += valor;
      n++;
    }
  };
  gastosDe(1, iniPrev, addDays(iniMes, -1), 470000);
  gastosDe(2, iniMes, hoy, 410000);
  // El último gasto del mes actual queda sin soporte (para ver el aviso "sin soporte").
  const sinSoporte = expenses.filter((e) => e.period_id === 2).pop()?.id;

  // Borrar lo anterior (también los archivos que subieron los visitantes) y sembrar.
  if (env.FILES) {
    let cursorR2;
    do {
      const l = await env.FILES.list({ cursor: cursorR2, limit: 1000 });
      const keys = l.objects.map((o) => o.key);
      if (keys.length) await env.FILES.delete(keys);
      cursorR2 = l.truncated ? l.cursor : undefined;
    } while (cursorR2);
  }
  const vCols = ['id', 'fecha', 'franja', 'orden', 'tipo', 'person_id', 'pharmacy_id', 'lugar', 'planeada', 'resultado', 'marca', 'medicamentos', 'notas', 'comentario', 'objetivo', 'done_at', 'reporte_listo_at', 'reporte_via', 'created_at', 'updated_at'];
  const stmts = [
    'DELETE FROM visit_brands', 'DELETE FROM visits', 'DELETE FROM people', 'DELETE FROM pharmacies', 'DELETE FROM cycles',
    'DELETE FROM expenses', 'DELETE FROM periods',
    "DELETE FROM sqlite_sequence WHERE name IN ('visits','people','pharmacies','cycles','expenses','periods')",
    insert('cycles', ['id', 'numero', 'fecha_inicio', 'fecha_fin', 'created_at'], [[1, 9, prevIni, prevFin, t], [2, 10, inicio, fin, t]]),
    insert('people', ['id', 'nombre', 'esp', 'institucion', 'ciudad', 'frecuencia', 'activo', 'created_at'], people.map((p) => [p.id, p.nombre, p.esp, p.institucion, p.ciudad, p.frecuencia, 1, t])),
    insert('pharmacies', ['id', 'nombre', 'ciudad', 'activo'], pharm.map((f) => [f.id, f.nombre, f.ciudad, 1])),
    insert('periods', ['id', 'nombre', 'fecha_inicio', 'saldo_inicial', 'estado', 'created_at', 'closed_at'], periods.map((p) => [p.id, p.nombre, p.fecha_inicio, p.saldo_inicial, p.estado, t, p.closed_at])),
  ];
  for (let i = 0; i < visits.length; i += 40) {
    stmts.push(
      insert('visits', vCols, visits.slice(i, i + 40).map((v) => [v.id, v.fecha, v.franja, v.orden, v.tipo, v.person_id, v.pharmacy_id, v.lugar, 1, v.resultado, v.marca, v.medicamentos || null, v.notas, v.comentario, v.objetivo, v.resultado ? t : null, v.reporte_listo_at, v.reporte_via, t, t]))
    );
  }
  const eCols = ['id', 'period_id', 'proveedor', 'nit', 'factura', 'factura_norm', 'fecha', 'motivo', 'valor', 'funcionario', 'file_key', 'file_type', 'file_name', 'created_at', 'updated_at'];
  stmts.push(
    insert('expenses', eCols, expenses.map((e) => {
      const key = e.id === sinSoporte ? null : `demo/soporte-${e.id}.pdf`;
      return [e.id, e.period_id, e.proveedor, e.nit, e.factura, e.factura.toUpperCase(), e.fecha, e.motivo, e.valor, e.funcionario, key, key && 'application/pdf', key && `factura-${e.factura}.pdf`, t, t];
    }))
  );
  await db.batch(stmts.map((s) => db.prepare(s)));
  if (env.FILES) {
    for (const e of expenses) {
      if (e.id === sinSoporte) continue;
      const pdf = pdfSoporte([e.proveedor, `NIT ${e.nit}`, `Factura electrónica de venta ${e.factura}`, `Fecha ${e.fecha}`, `Total pagado ${peso(e.valor)}`, '', 'Soporte de ejemplo - versión demo con datos ficticios']);
      await env.FILES.put(`demo/soporte-${e.id}.pdf`, pdf, { httpMetadata: { contentType: 'application/pdf' } });
    }
  }
  return { visitas: visits.length, contactos: people.length, farmacias: pharm.length, gastos: expenses.length };
}

// Reinicia una vez al día (al primer ingreso del día). Solo una petición gana la carrera.
export async function seedIfStale(env, db) {
  const hoy = hoyBogota();
  const r = await db
    .prepare("INSERT INTO meta (key, value) VALUES ('demo_seed', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE meta.value<>excluded.value")
    .bind(hoy)
    .run();
  if (r.meta.changes) await seedDemo(env, db);
}

// Botón "Reiniciar demo": máximo una vez cada 20 segundos.
export async function resetDemo(env, db) {
  const ahora = Date.now();
  const last = await db.prepare("SELECT value FROM meta WHERE key='demo_reset_at'").first();
  if (last && ahora - Number(last.value) < 20000) throw new HttpError(429, 'La demo se acaba de reiniciar. Espera unos segundos.');
  await db.prepare("INSERT INTO meta (key, value) VALUES ('demo_reset_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(ahora)).run();
  await db.prepare("INSERT INTO meta (key, value) VALUES ('demo_seed', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(hoyBogota()).run();
  return seedDemo(env, db);
}

// ---------- IA simulada ----------
// Lectura de factura: devuelve una factura ficticia con número al azar (para no chocar con el control de duplicados).
export function demoInvoice() {
  const pr = PROVEEDORES[Math.floor(Math.random() * PROVEEDORES.length)];
  return {
    proveedor: pr.proveedor,
    nit: pr.nit,
    factura: pr.pref + String(10000 + Math.floor(Math.random() * 89999)),
    fecha: hoyBogota(),
    valor: VALORES[Math.floor(Math.random() * VALORES.length)],
    notas: 'Demo: datos simulados. En la versión real, Claude lee la foto o el PDF y llena estos campos.',
    fecha_revisar: false,
  };
}

// Dictado: siempre la misma nota de ejemplo, con muletillas, para ver cómo "Generar" la limpia.
export const DEMO_DICTADO =
  'eh bueno, el doctor comenta que tiene, o sea, varios pacientes nuevos en tratamiento con novaclot y pues pidió información de las presentaciones. eh queda pendiente llevarle muestras la próxima semana';

// Ajuste del texto: limpieza local (sin IA) de muletillas y formato. La versión real usa Claude.
export function demoAjustar(texto) {
  let s = String(texto || '');
  s = s.replace(/[,;]?\s*\b(?:eh+|mm+|o sea|pues)\b\s*[,;]?/gi, ' ');
  s = s.trim().replace(/(^|[.!?]\s*|,\s*)bueno\s*,?\s*/gi, '$1'); // "bueno" solo como muletilla (al inicio o entre comas)
  s = s.replace(/\s*,\s*,+/g, ',').replace(/\s+([,.;])/g, '$1').replace(/(^|[.!?]\s*)[,;]\s*/g, '$1').replace(/\s{2,}/g, ' ').trim();
  if (s && !/[.!?]$/.test(s)) s += '.';
  return normalizar(s);
}

