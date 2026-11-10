// API del módulo de visitas médicas: ciclos, semana, planeación y estados.
// El estado de una visita no se guarda: se calcula con resultado + fecha + reporte_listo_at (ver estadoDe).
import { HttpError } from './extract.js';
import { esFecha, diasHabiles, esHabil, festivo, hoyBogota, lunes, addDays } from './fechas.js';
import { redactarRoute } from './redactar.js';
import { MARCAS, SIN_MARCA, MEDICAMENTOS } from '../public/marcas.js';

export const META_CONTACTOS_DIA = 9;
export const META_FARMACIAS_DIA = 3;

const now = () => new Date().toISOString();
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Datos inválidos.');
  }
}
const fail = (status, msg) => {
  throw new HttpError(status, msg);
};
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corta = (s) => `${DIAS[new Date(s + 'T00:00:00Z').getUTCDay()].slice(0, 3)} ${Number(s.slice(8))} ${MESES[Number(s.slice(5, 7)) - 1]}`;

// ---------- estado ----------
// por_hacer (hoy) · programada (futura) · no_realizada (pasó sin marcar)
// pendiente (realizada sin reporte) · listo · ne_pendiente / ne_listo (no efectiva)
export function estadoDe(v, hoy) {
  if (!v.resultado) return v.fecha < hoy ? 'no_realizada' : v.fecha === hoy ? 'por_hacer' : 'programada';
  const listo = !!v.reporte_listo_at;
  if (v.resultado === 'no_efectiva') return listo ? 'ne_listo' : 'ne_pendiente';
  return listo ? 'listo' : 'pendiente';
}

// ---------- ciclos ----------
function cleanCycle(b) {
  const c = { numero: Number(b.numero), fecha_inicio: String(b.fecha_inicio ?? '').trim(), fecha_fin: String(b.fecha_fin ?? '').trim() };
  const faltan = [];
  if (!Number.isInteger(c.numero) || c.numero <= 0) faltan.push('Número del ciclo');
  if (!esFecha(c.fecha_inicio)) faltan.push('Fecha de inicio');
  if (!esFecha(c.fecha_fin)) faltan.push('Fecha de fin');
  if (faltan.length) fail(400, 'Revisa estos campos: ' + faltan.join(', ') + '.');
  if (c.fecha_fin < c.fecha_inicio) fail(400, 'La fecha de fin debe ser igual o posterior a la de inicio.');
  return c;
}
const withDays = (c) => c && { ...c, dias_habiles: diasHabiles(c.fecha_inicio, c.fecha_fin).length };
async function checkOverlap(db, c, exceptId = 0) {
  const o = await db
    .prepare('SELECT numero, fecha_inicio, fecha_fin FROM cycles WHERE id<>? AND fecha_inicio<=? AND fecha_fin>=?')
    .bind(exceptId, c.fecha_fin, c.fecha_inicio)
    .first();
  if (o) fail(409, `Se cruza con el ciclo ${o.numero} (${o.fecha_inicio} a ${o.fecha_fin}).`);
}
const cycleOf = (db, fecha) => db.prepare('SELECT * FROM cycles WHERE fecha_inicio<=? AND fecha_fin>=?').bind(fecha, fecha).first();

async function cyclesRoute(request, db, method, id) {
  if (!id && method === 'GET') {
    const { results } = await db.prepare('SELECT * FROM cycles ORDER BY fecha_inicio DESC').all();
    return json(results.map(withDays));
  }
  if (!id && method === 'POST') {
    const c = cleanCycle(await readJson(request));
    await checkOverlap(db, c);
    const r = await db.prepare('INSERT INTO cycles (numero, fecha_inicio, fecha_fin, created_at) VALUES (?,?,?,?)').bind(c.numero, c.fecha_inicio, c.fecha_fin, now()).run();
    return json(withDays(await db.prepare('SELECT * FROM cycles WHERE id=?').bind(r.meta.last_row_id).first()), 201);
  }
  const cid = Number(id);
  if (!(await db.prepare('SELECT id FROM cycles WHERE id=?').bind(cid).first())) fail(404, 'Ese ciclo no existe.');
  if (method === 'PATCH') {
    const c = cleanCycle(await readJson(request));
    await checkOverlap(db, c, cid);
    await db.prepare('UPDATE cycles SET numero=?, fecha_inicio=?, fecha_fin=? WHERE id=?').bind(c.numero, c.fecha_inicio, c.fecha_fin, cid).run();
    return json(withDays(await db.prepare('SELECT * FROM cycles WHERE id=?').bind(cid).first()));
  }
  fail(404, 'No encontrado.');
}

// ---------- consultas ----------
const VISIT_SELECT = `SELECT v.*, COALESCE(p.nombre, f.nombre) AS nombre, p.esp, COALESCE(p.ciudad, f.ciudad) AS ciudad, p.institucion
  FROM visits v LEFT JOIN people p ON p.id=v.person_id LEFT JOIN pharmacies f ON f.id=v.pharmacy_id`;
const shape = (v, hoy) => ({
  id: v.id, fecha: v.fecha, franja: v.franja, orden: v.orden, tipo: v.tipo,
  person_id: v.person_id, pharmacy_id: v.pharmacy_id, nombre: v.nombre, esp: v.esp || '', ciudad: v.ciudad,
  institucion: v.institucion || '', lugar: v.lugar, planeada: !!v.planeada, resultado: v.resultado,
  reporte_listo: !!v.reporte_listo_at, reporte_via: v.reporte_via, estado: estadoDe(v, hoy),
});

// Métricas de un rango: contactos y farmacias con reporte listo (las no efectivas no cuentan).
async function conteos(db, desde, hasta) {
  return db
    .prepare(
      `SELECT
        SUM(tipo='persona' AND resultado='realizada' AND reporte_listo_at IS NOT NULL) AS contactos,
        SUM(tipo='farmacia' AND resultado='realizada' AND reporte_listo_at IS NOT NULL) AS farmacias,
        SUM(reporte_listo_at IS NOT NULL) AS con_reporte,
        COUNT(*) AS programados,
        SUM(resultado IS NULL AND fecha<?) AS no_realizadas
      FROM visits WHERE fecha>=? AND fecha<=?`
    )
    .bind(hoyBogota(), desde, hasta)
    .first();
}

async function cicloResumen(db, c, hoy) {
  if (!c) return null;
  const hab = diasHabiles(c.fecha_inicio, c.fecha_fin);
  const transcurridos = hab.filter((d) => d <= hoy).length; // "día N de 20" (incluye hoy)
  const cerrados = hab.filter((d) => d < hoy).length; // días que ya terminaron: base de lo esperado (hasta ayer)
  const k = await conteos(db, c.fecha_inicio, c.fecha_fin);
  const pend = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM people p WHERE p.activo=1 AND p.frecuencia>0 AND p.frecuencia >
        (SELECT COUNT(*) FROM visits v WHERE v.person_id=p.id AND v.resultado='realizada' AND v.fecha>=? AND v.fecha<=?)`
    )
    .bind(c.fecha_inicio, c.fecha_fin)
    .first();
  return {
    id: c.id, numero: c.numero, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin,
    dias_habiles: hab.length, dia: transcurridos, dias_restantes: hab.filter((d) => d > hoy).length,
    contactos: k.contactos || 0, meta_contactos: META_CONTACTOS_DIA * hab.length, meta_contactos_fecha: META_CONTACTOS_DIA * cerrados,
    farmacias: k.farmacias || 0, meta_farmacias: META_FARMACIAS_DIA * hab.length, meta_farmacias_fecha: META_FARMACIAS_DIA * cerrados,
    pendientes_panel: pend.n,
  };
}

async function week(db, url) {
  const hoy = hoyBogota();
  const pedido = url.searchParams.get('lunes');
  const lun = lunes(esFecha(pedido) ? pedido : hoy);
  const vie = addDays(lun, 4);
  const { results } = await db.prepare(VISIT_SELECT + ' WHERE v.fecha>=? AND v.fecha<=? ORDER BY v.fecha, v.franja, v.orden, v.id').bind(lun, vie).all();
  const dias = [0, 1, 2, 3, 4].map((i) => {
    const fecha = addDays(lun, i);
    return { fecha, festivo: festivo(fecha), habil: esHabil(fecha), visitas: results.filter((v) => v.fecha === fecha).map((v) => shape(v, hoy)) };
  });
  const habSemana = dias.filter((d) => d.habil).length;
  const transSemana = dias.filter((d) => d.habil && d.fecha < hoy).length; // días hábiles que ya terminaron (hasta ayer): base de lo esperado
  const k = await conteos(db, lun, vie);
  // Visitas de días pasados ya hechas pero sin reporte en la app (para el aviso).
  const { results: pend } = await db
    .prepare("SELECT fecha, COUNT(*) AS n FROM visits WHERE fecha<? AND fecha>=? AND resultado IS NOT NULL AND reporte_listo_at IS NULL GROUP BY fecha ORDER BY fecha DESC")
    .bind(hoy, addDays(hoy, -40))
    .all();
  const ciclo = (await cycleOf(db, hoy)) || (await db.prepare('SELECT * FROM cycles WHERE fecha_fin<? ORDER BY fecha_fin DESC').bind(hoy).first());
  return json({
    hoy, lunes: lun, dias,
    semana: {
      contactos: k.contactos || 0, meta_contactos: META_CONTACTOS_DIA * habSemana,
      farmacias: k.farmacias || 0, meta_farmacias: META_FARMACIAS_DIA * habSemana,
      esperado_contactos: META_CONTACTOS_DIA * transSemana, esperado_farmacias: META_FARMACIAS_DIA * transSemana,
      con_reporte: k.con_reporte || 0, programados: k.programados || 0, no_realizadas: k.no_realizadas || 0,
    },
    ciclo: await cicloResumen(db, ciclo, hoy),
    pendientes_reporte: pend.map((p) => ({ fecha: p.fecha, n: p.n, etiqueta: corta(p.fecha) })),
    metas: { contactos_dia: META_CONTACTOS_DIA, farmacias_dia: META_FARMACIAS_DIA },
  });
}

// Quiénes se pueden agregar a una fecha.
async function available(db, url) {
  const fecha = url.searchParams.get('fecha');
  if (!esFecha(fecha)) fail(400, 'Fecha inválida.');
  const hoy = hoyBogota();
  const c = await cycleOf(db, fecha);
  const ini = c ? c.fecha_inicio : lunes(fecha);
  const fin = c ? c.fecha_fin : addDays(lunes(fecha), 4);
  const { results: people } = await db.prepare('SELECT id, nombre, esp, institucion, ciudad, frecuencia FROM people WHERE activo=1 ORDER BY ciudad, institucion, nombre').all();
  const { results: vis } = await db
    .prepare('SELECT person_id, pharmacy_id, fecha, resultado, reporte_listo_at FROM visits WHERE fecha>=? AND fecha<=? ORDER BY fecha')
    .bind(ini, fin)
    .all();
  const porPersona = new Map();
  for (const v of vis) if (v.person_id) (porPersona.get(v.person_id) || porPersona.set(v.person_id, []).get(v.person_id)).push(v);
  const personas = people.map((p) => {
    const vs = porPersona.get(p.id) || [];
    const hechas = vs.filter((v) => v.resultado === 'realizada').length;
    const abiertas = vs.filter((v) => !v.resultado && v.fecha >= hoy && v.fecha !== fecha);
    const enFecha = vs.some((v) => v.fecha === fecha);
    let nota = '';
    const ultima = vs.filter((v) => v.fecha < hoy && v.resultado !== 'realizada').pop();
    if (abiertas.length) nota = 'Programada ' + corta(abiertas[0].fecha);
    else if (ultima) nota = (ultima.resultado === 'no_efectiva' ? 'No efectiva el ' : 'No realizada el ') + corta(ultima.fecha);
    const pendiente = Math.max(0, p.frecuencia - hechas - abiertas.length);
    return { ...p, hechas, pendiente, en_fecha: enFecha, nota };
  });
  const { results: farm } = await db.prepare('SELECT id, nombre, ciudad FROM pharmacies WHERE activo=1 ORDER BY ciudad, nombre').all();
  const farmacias = farm.map((f) => {
    const vs = vis.filter((v) => v.pharmacy_id === f.id);
    // Mismo chip que los médicos: próxima visita agendada o, si no hay, la última que no se hizo.
    // En farmacias se mira solo la última visita pasada (tienen varias por ciclo).
    const abiertas = vs.filter((v) => !v.resultado && v.fecha >= hoy && v.fecha !== fecha);
    const ultima = vs.filter((v) => v.fecha < hoy).pop();
    let nota = '';
    if (abiertas.length) nota = 'Programada ' + corta(abiertas[0].fecha);
    else if (ultima && ultima.resultado !== 'realizada') nota = (ultima.resultado === 'no_efectiva' ? 'No efectiva el ' : 'No realizada el ') + corta(ultima.fecha);
    return { ...f, hechas: vs.filter((v) => v.resultado === 'realizada').length, en_fecha: vs.some((v) => v.fecha === fecha), nota };
  });
  const dia = await db.prepare("SELECT SUM(tipo='persona') AS contactos, SUM(tipo='farmacia') AS farmacias FROM visits WHERE fecha=?").bind(fecha).first();
  return json({
    fecha, festivo: festivo(fecha), habil: esHabil(fecha), ciclo: c ? { numero: c.numero } : null,
    dia: { contactos: dia.contactos || 0, farmacias: dia.farmacias || 0 }, metas: { contactos_dia: META_CONTACTOS_DIA, farmacias_dia: META_FARMACIAS_DIA },
    personas, farmacias,
  });
}

// ---------- visitas ----------
function checkDiaPlaneable(fecha) {
  if (!esFecha(fecha)) fail(400, 'Fecha inválida.');
  if (fecha < hoyBogota()) fail(409, 'No se pueden agregar visitas a días que ya pasaron.');
  if (festivo(fecha)) fail(409, `El ${fecha} es festivo (${festivo(fecha)}).`);
  if (!esHabil(fecha)) fail(409, 'Solo se planean visitas de lunes a viernes.');
}
const nextOrden = async (db, fecha, franja) =>
  ((await db.prepare('SELECT MAX(orden) AS m FROM visits WHERE fecha=? AND franja=?').bind(fecha, franja).first()).m ?? -1) + 1;

async function getVisit(db, id) {
  const v = await db.prepare(VISIT_SELECT + ' WHERE v.id=?').bind(Number(id)).first();
  if (!v) fail(404, 'Esa visita no existe.');
  return v;
}

async function addVisits(request, db) {
  const b = await readJson(request);
  const fecha = String(b.fecha || '');
  checkDiaPlaneable(fecha);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) fail(400, 'Elige al menos un contacto o farmacia.');
  const t = now();
  const stmts = [];
  const orden = { AM: await nextOrden(db, fecha, 'AM'), PM: await nextOrden(db, fecha, 'PM') };
  const vistos = new Set();
  for (const it of items) {
    const franja = it.franja === 'PM' ? 'PM' : 'AM';
    const clave = (it.tipo === 'farmacia' ? 'f' : 'p') + Number(it.id);
    if (vistos.has(clave)) fail(400, 'Elegiste dos veces el mismo contacto o farmacia.');
    vistos.add(clave);
    if (it.tipo === 'farmacia') {
      const f = await db.prepare('SELECT * FROM pharmacies WHERE id=? AND activo=1').bind(Number(it.id)).first();
      if (!f) fail(404, 'Una de las farmacias no existe.');
      if (await db.prepare('SELECT id FROM visits WHERE pharmacy_id=? AND fecha=?').bind(f.id, fecha).first()) fail(409, `${f.nombre} ya está en ese día.`);
      stmts.push(db.prepare("INSERT INTO visits (fecha, franja, orden, tipo, pharmacy_id, lugar, planeada, created_at, updated_at) VALUES (?,?,?,'farmacia',?,?,1,?,?)").bind(fecha, franja, orden[franja]++, f.id, f.nombre, t, t));
    } else {
      const p = await db.prepare('SELECT * FROM people WHERE id=? AND activo=1').bind(Number(it.id)).first();
      if (!p) fail(404, 'Uno de los contactos no existe.');
      if (await db.prepare('SELECT id FROM visits WHERE person_id=? AND fecha=?').bind(p.id, fecha).first()) fail(409, `${p.nombre} ya está en ese día.`);
      const lugar = String(it.lugar || '').trim() || p.institucion;
      stmts.push(db.prepare("INSERT INTO visits (fecha, franja, orden, tipo, person_id, lugar, planeada, created_at, updated_at) VALUES (?,?,?,'persona',?,?,1,?,?)").bind(fecha, franja, orden[franja]++, p.id, lugar, t, t));
    }
  }
  await db.batch(stmts);
  return json({ ok: true, agregadas: stmts.length }, 201);
}

// Mover y reordenar: recibe el orden completo de una lista (fecha + franja).
async function reorder(request, db) {
  const b = await readJson(request);
  const fecha = String(b.fecha || '');
  const franja = b.franja === 'PM' ? 'PM' : 'AM';
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number);
  if (!esFecha(fecha) || !ids.length) fail(400, 'Datos inválidos.');
  const stmts = [];
  for (const [i, id] of ids.entries()) {
    const v = await getVisit(db, id);
    if (v.fecha !== fecha) {
      if (v.resultado) fail(409, 'Una visita ya marcada no se puede pasar a otro día.');
      checkDiaPlaneable(fecha);
      const choque = await db.prepare(`SELECT id FROM visits WHERE ${v.person_id ? 'person_id' : 'pharmacy_id'}=? AND fecha=? AND id<>?`).bind(v.person_id || v.pharmacy_id, fecha, v.id).first();
      if (choque) fail(409, `${v.nombre} ya está en ese día.`);
    }
    stmts.push(db.prepare('UPDATE visits SET fecha=?, franja=?, orden=?, updated_at=? WHERE id=?').bind(fecha, franja, i, now(), id));
  }
  await db.batch(stmts);
  return json({ ok: true });
}

// ---------- reporte ----------
const MAX_TEXTO = 4000;
const texto = (x, prev) => (x === undefined ? prev ?? null : String(x ?? '').slice(0, MAX_TEXTO) || null);
function cleanReporte(b, v) {
  let marca = v.marca ?? null;
  if (b.marca !== undefined) {
    marca = b.marca || null;
    if (marca && marca !== SIN_MARCA && !MARCAS.some((m) => m.id === marca)) fail(400, 'Marca inválida.');
  }
  let medicamentos = v.medicamentos ?? null;
  if (b.medicamentos !== undefined) {
    const xs = (Array.isArray(b.medicamentos) ? b.medicamentos : []).map(String);
    if (xs.some((x) => !MEDICAMENTOS.includes(x))) fail(400, 'Medicamento inválido.');
    medicamentos = MEDICAMENTOS.filter((m) => xs.includes(m)).join(',') || null;
  }
  return {
    marca, medicamentos,
    notas: texto(b.notas, v.notas), nota_objetivo: texto(b.nota_objetivo, v.nota_objetivo),
    comentario: texto(b.comentario, v.comentario), objetivo: texto(b.objetivo, v.objetivo),
  };
}
// Visita con los campos del reporte y la marca sugerida (la de la última visita a esa persona con marca).
async function conReporte(db, v, hoy) {
  let sugerida = null;
  if (v.person_id && !v.marca) {
    const u = await db
      .prepare("SELECT marca FROM visits WHERE person_id=? AND id<>? AND marca IS NOT NULL AND marca<>'' ORDER BY fecha DESC, id DESC LIMIT 1")
      .bind(v.person_id, v.id)
      .first();
    sugerida = u ? u.marca : null;
  }
  return {
    ...shape(v, hoy),
    marca: v.marca || null, marca_sugerida: sugerida,
    medicamentos: v.medicamentos ? v.medicamentos.split(',') : [],
    notas: v.notas || '', nota_objetivo: v.nota_objetivo || '',
    comentario: v.comentario || '', objetivo: v.objetivo || '',
  };
}

async function visitsRoute(request, db, method, id, sub) {
  if (!id && method === 'POST') return addVisits(request, db);
  if (id === 'reorder' && method === 'POST') return reorder(request, db);
  const hoy = hoyBogota();
  const v = await getVisit(db, id);
  if (!sub && method === 'GET') return json(await conReporte(db, v, hoy));
  // Lugar y/o campos del reporte (se guardan mientras la usuaria escribe, para no perder nada).
  if (!sub && method === 'PATCH') {
    const b = await readJson(request);
    const lugar = String(b.lugar ?? v.lugar).trim();
    if (!lugar) fail(400, 'Escribe el lugar de la visita.');
    const r = cleanReporte(b, v);
    await db
      .prepare('UPDATE visits SET lugar=?, marca=?, medicamentos=?, notas=?, nota_objetivo=?, comentario=?, objetivo=?, updated_at=? WHERE id=?')
      .bind(lugar, r.marca, r.medicamentos, r.notas, r.nota_objetivo, r.comentario, r.objetivo, now(), v.id)
      .run();
    return json(await conReporte(db, await getVisit(db, v.id), hoy));
  }
  if (!sub && method === 'DELETE') {
    if (v.resultado) fail(409, 'Esta visita ya está marcada. Pásala a "Por hacer" antes de quitarla.');
    await db.prepare('DELETE FROM visit_brands WHERE visit_id=?').bind(v.id).run();
    await db.prepare('DELETE FROM visits WHERE id=?').bind(v.id).run();
    return json({ ok: true });
  }
  // Marcar: realizada · no_efectiva · null (volver a "Por hacer").
  if (sub === 'estado' && method === 'POST') {
    const { resultado } = await readJson(request);
    if (![null, 'realizada', 'no_efectiva'].includes(resultado ?? null)) fail(400, 'Estado inválido.');
    if (v.fecha > hoy) fail(409, 'Solo se marcan visitas de hoy o de días anteriores.');
    if (resultado) await db.prepare('UPDATE visits SET resultado=?, done_at=COALESCE(done_at, ?), updated_at=? WHERE id=?').bind(resultado, now(), now(), v.id).run();
    else await db.prepare('UPDATE visits SET resultado=NULL, done_at=NULL, reporte_listo_at=NULL, reporte_via=NULL, updated_at=? WHERE id=?').bind(now(), v.id).run();
    return json(shape(await getVisit(db, v.id), hoy));
  }
  // Reporte listo: al copiar el comentario o con "Lo reporté directo en la tablet". Si estaba por hacer, queda realizada.
  if (sub === 'reporte' && method === 'POST') {
    const b = await readJson(request);
    const via = b.via;
    if (!['copia', 'tablet'].includes(via)) fail(400, 'Datos inválidos.');
    if (v.fecha > hoy) fail(409, 'Esta visita todavía no ha pasado.');
    const r = cleanReporte(b, v); // al copiar, la app manda también el texto final
    await db
      .prepare(
        `UPDATE visits SET resultado=COALESCE(resultado,'realizada'), done_at=COALESCE(done_at, ?), reporte_listo_at=COALESCE(reporte_listo_at, ?), reporte_via=COALESCE(reporte_via, ?),
          marca=?, medicamentos=?, notas=?, nota_objetivo=?, comentario=?, objetivo=?, updated_at=? WHERE id=?`
      )
      .bind(now(), now(), via, r.marca, r.medicamentos, r.notas, r.nota_objetivo, r.comentario, r.objetivo, now(), v.id)
      .run();
    return json(await conReporte(db, await getVisit(db, v.id), hoy));
  }
  if (sub === 'reporte' && method === 'DELETE') {
    await db.prepare('UPDATE visits SET reporte_listo_at=NULL, reporte_via=NULL, updated_at=? WHERE id=?').bind(now(), v.id).run();
    return json(shape(await getVisit(db, v.id), hoy));
  }
  fail(404, 'No encontrado.');
}

// Punto de entrada desde functions/api/[[path]].js
export async function visitasRoute(request, db, parts, env = {}) {
  const [res, id, sub] = parts;
  const method = request.method;
  const url = new URL(request.url);
  if (res === 'compose' || res === 'transcribe') return redactarRoute(request, env, res);
  if (res === 'cycles') return cyclesRoute(request, db, method, id);
  if (res === 'week' && method === 'GET') return week(db, url);
  if (res === 'available' && method === 'GET') return available(db, url);
  if (res === 'visits') return visitsRoute(request, db, method, id, sub);
  return null;
}
export const VISITAS_RES = ['cycles', 'week', 'available', 'visits', 'compose', 'transcribe'];
