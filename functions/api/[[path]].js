// API de la app: /api/<recurso>. Una sola usuaria, acceso con PIN.
import { ensureSchema, now, normFactura, mismoNit } from '../../lib/db.js';
import { CONFIG, SESSION_DAYS, MAX_FAILS, FAIL_WINDOW_MIN, GLOBAL_MAX_FAILS_HOUR, GLOBAL_MAX_FAILS_DAY, PURGE_DAYS, MAX_FILE_MB } from '../../lib/config.js';
import { extractInvoice, HttpError } from '../../lib/extract.js';
import { visitasRoute, VISITAS_RES } from '../../lib/visitas.js';
import { demoOn, seedIfStale, resetDemo, demoInvoice, DEMO_MAX_FILE_MB } from '../../lib/demo.js';

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status, error) => json({ error }, status);
const ip = (req) => req.headers.get('cf-connecting-ip') || 'local';

export async function onRequest(context) {
  const { request, env, params } = context;
  try {
    const db = env.DB;
    await ensureSchema(db);
    const parts = [].concat(params.path || []);
    return await route(request, env, db, parts);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.log('Error', e && e.stack);
    return fail(500, 'Algo salió mal. Intenta de nuevo.');
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Datos inválidos.');
  }
}

// ---------- sesión ----------
function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
const sessionCookie = (token, maxAge) => `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

async function authed(request, db) {
  const tok = getCookie(request, 'sid');
  if (!tok) return false;
  const row = await db.prepare('SELECT expires FROM sessions WHERE token=?').bind(tok).first();
  return !!row && row.expires > now();
}

// Comparación de PIN en tiempo constante.
function samePin(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- utilidades de datos ----------
async function periodWithTotals(db, id) {
  const p = await db.prepare('SELECT * FROM periods WHERE id=?').bind(id).first();
  if (!p) return null;
  const t = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(valor),0) AS total FROM expenses WHERE period_id=?').bind(id).first();
  return decorate(p, t.n, t.total);
}
function decorate(p, n, total) {
  return { ...p, transacciones: n, total, disponible: p.saldo_inicial - total };
}
async function openPeriod(db) {
  return db.prepare("SELECT * FROM periods WHERE estado='abierto'").first();
}

function cleanExpense(b) {
  const e = {
    proveedor: String(b.proveedor ?? '').trim(),
    nit: String(b.nit ?? '').trim(),
    factura: String(b.factura ?? '').trim(),
    fecha: String(b.fecha ?? '').trim(),
    motivo: String(b.motivo ?? '').trim(),
    valor: Number(b.valor),
    funcionario: String(b.funcionario ?? '').trim(),
  };
  const faltan = [];
  if (!e.proveedor) faltan.push('Proveedor');
  if (!e.nit) faltan.push('NIT');
  if (!e.factura) faltan.push('Factura No.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha) || isNaN(Date.parse(e.fecha))) faltan.push('Fecha');
  if (!e.motivo) faltan.push('Motivo del gasto');
  if (!Number.isInteger(e.valor) || e.valor <= 0) faltan.push('Valor');
  if (!e.funcionario) faltan.push('Funcionario atendido');
  if (faltan.length) throw new HttpError(400, 'Revisa estos campos: ' + faltan.join(', ') + '.');
  e.factura_norm = normFactura(e.factura);
  return e;
}

// Duplicado = mismo NIT + mismo número de factura (el consecutivo es único por emisor, no entre emisores).
async function checkDuplicate(db, e, exceptId = 0) {
  const { results } = await db
    .prepare('SELECT e.id, e.nit, e.factura, e.proveedor, p.nombre FROM expenses e JOIN periods p ON p.id=e.period_id WHERE e.factura_norm=? AND e.id<>?')
    .bind(e.factura_norm, exceptId)
    .all();
  const d = results.find((r) => mismoNit(r.nit, e.nit));
  if (d) throw new HttpError(409, `La factura ${d.factura} ya está registrada (${d.proveedor}, período "${d.nombre}").`);
}

function cleanPeriod(b) {
  const p = {
    nombre: String(b.nombre ?? '').trim(),
    fecha_inicio: String(b.fecha_inicio ?? '').trim(),
    saldo_inicial: Number(b.saldo_inicial),
  };
  const faltan = [];
  if (!p.nombre) faltan.push('Nombre del período');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_inicio)) faltan.push('Fecha de inicio');
  if (!Number.isInteger(p.saldo_inicial) || p.saldo_inicial <= 0) faltan.push('Saldo inicial');
  if (faltan.length) throw new HttpError(400, 'Revisa estos campos: ' + faltan.join(', ') + '.');
  return p;
}

// Borra los soportes de períodos cerrados hace más de PURGE_DAYS días. Corre máximo una vez al día.
async function purgeOldFiles(env, db) {
  const today = now().slice(0, 10);
  const last = await db.prepare("SELECT value FROM meta WHERE key='last_purge'").first();
  if (last && last.value === today) return;
  await db.prepare("INSERT INTO meta (key, value) VALUES ('last_purge', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(today).run();
  const cutoff = new Date(Date.now() - PURGE_DAYS * 86400000).toISOString();
  const { results: periods } = await db
    .prepare("SELECT id FROM periods WHERE estado='cerrado' AND closed_at < ? AND files_purged_at IS NULL")
    .bind(cutoff)
    .all();
  for (const p of periods) {
    const { results } = await db.prepare('SELECT file_key FROM expenses WHERE period_id=? AND file_key IS NOT NULL').bind(p.id).all();
    const keys = results.map((r) => r.file_key);
    for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
    await db.batch([
      db.prepare('UPDATE expenses SET file_key=NULL, file_type=NULL WHERE period_id=?').bind(p.id),
      db.prepare('UPDATE periods SET files_purged_at=? WHERE id=?').bind(now(), p.id),
    ]);
  }
}

// ---------- visitas ----------
const visitasOn = (env) => String(env.VISITAS_ON || '') === '1' || demoOn(env);
// En la demo el límite de archivos es más bajo (cualquiera con el PIN público puede subir).
const maxMb = (env) => (demoOn(env) ? DEMO_MAX_FILE_MB : MAX_FILE_MB);

// ---------- rutas ----------
async function route(request, env, db, parts) {
  const method = request.method;
  const [res, id, sub] = parts;

  // Información pública para la pantalla de ingreso (en la demo muestra el PIN).
  if (res === 'info' && method === 'GET') {
    return json({ demo: demoOn(env), pin: demoOn(env) ? String(env.APP_PIN || '') : null });
  }

  // Login
  if (res === 'login' && method === 'POST') {
    const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60000).toISOString();
    const fails = await db.prepare('SELECT COUNT(*) AS n FROM login_fails WHERE ip=? AND at>?').bind(ip(request), since).first();
    if (fails.n >= MAX_FAILS) return fail(429, `Demasiados intentos. Espera ${FAIL_WINDOW_MIN} minutos.`);
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const global = await db
      .prepare('SELECT SUM(at>?) AS hora, COUNT(*) AS dia FROM login_fails WHERE at>?')
      .bind(hourAgo, dayAgo)
      .first();
    // En la demo el PIN es público: no aplica el bloqueo global (solo el de cada IP).
    if (!demoOn(env) && ((global.hora || 0) >= GLOBAL_MAX_FAILS_HOUR || (global.dia || 0) >= GLOBAL_MAX_FAILS_DAY))
      return fail(429, 'El ingreso con PIN está bloqueado por muchos intentos fallidos. Intenta más tarde o escríbele al administrador.');
    const { pin } = await readJson(request);
    if (!env.APP_PIN) return fail(503, 'Falta configurar el PIN de la app (APP_PIN).');
    if (!samePin(String(pin || ''), String(env.APP_PIN))) {
      await db.batch([
        db.prepare('INSERT INTO login_fails (ip, at) VALUES (?, ?)').bind(ip(request), now()),
        db.prepare('DELETE FROM login_fails WHERE at<?').bind(new Date(Date.now() - 86400000).toISOString()),
      ]);
      return fail(401, 'PIN incorrecto.');
    }
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await db.batch([
      db.prepare('INSERT INTO sessions (token, expires) VALUES (?, ?)').bind(token, expires),
      db.prepare('DELETE FROM sessions WHERE expires<?').bind(now()),
      db.prepare('DELETE FROM login_fails WHERE ip=?').bind(ip(request)),
    ]);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
  }

  if (res === 'logout' && method === 'POST') {
    const tok = getCookie(request, 'sid');
    if (tok) await db.prepare('DELETE FROM sessions WHERE token=?').bind(tok).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  if (!(await authed(request, db))) return fail(401, 'Tu sesión terminó. Ingresa tu PIN.');

  // Estado general
  if (res === 'me' && method === 'GET') {
    if (demoOn(env)) await seedIfStale(env, db);
    else await purgeOldFiles(env, db);
    const open = await openPeriod(db);
    return json({ config: { ...CONFIG, maxFileMb: maxMb(env) }, periodoAbierto: open ? open.id : null, visitas: visitasOn(env), demo: demoOn(env) });
  }

  // Demo: volver a los datos de ejemplo
  if (res === 'demo' && id === 'reset' && method === 'POST') {
    if (!demoOn(env)) return fail(404, 'No encontrado.');
    return json({ ok: true, ...(await resetDemo(env, db)) });
  }

  // ----- Visitas (apagadas en producción hasta el lanzamiento: VISITAS_ON) -----
  if (VISITAS_RES.includes(res)) {
    if (!visitasOn(env)) return fail(404, 'No encontrado.');
    return (await visitasRoute(request, db, parts, env)) || fail(404, 'No encontrado.');
  }

  // Lectura de factura con IA
  if (res === 'extract' && method === 'POST') {
    const type = (request.headers.get('content-type') || '').split(';')[0].trim();
    const b64 = await request.text();
    if (b64.length > maxMb(env) * 1.4 * 1024 * 1024) return fail(413, `El archivo es muy grande (máximo ${maxMb(env)} MB).`);
    if (demoOn(env)) return json(demoInvoice()); // IA simulada en la demo
    return json(await extractInvoice(env, type, b64));
  }

  // ----- Períodos -----
  if (res === 'periods') {
    if (!id && method === 'GET') {
      const { results } = await db
        .prepare(
          `SELECT p.*, COUNT(e.id) AS n, COALESCE(SUM(e.valor),0) AS total
           FROM periods p LEFT JOIN expenses e ON e.period_id=p.id GROUP BY p.id ORDER BY p.fecha_inicio DESC, p.id DESC`
        )
        .all();
      return json(results.map(({ n, total, ...p }) => decorate(p, n, total)));
    }
    if (!id && method === 'POST') {
      if (await openPeriod(db)) return fail(409, 'Ya hay un período abierto. Ciérralo antes de iniciar otro.');
      const p = cleanPeriod(await readJson(request));
      const r = await db
        .prepare("INSERT INTO periods (nombre, fecha_inicio, saldo_inicial, estado, created_at) VALUES (?,?,?, 'abierto', ?)")
        .bind(p.nombre, p.fecha_inicio, p.saldo_inicial, now())
        .run();
      return json(await periodWithTotals(db, r.meta.last_row_id), 201);
    }

    const pid = Number(id);
    const period = await periodWithTotals(db, pid);
    if (!period) return fail(404, 'Ese período no existe.');

    if (!sub && method === 'GET') {
      const { results } = await db
        .prepare('SELECT id, proveedor, nit, factura, fecha, motivo, valor, funcionario, file_type, file_name, file_key IS NOT NULL AS tiene_soporte, created_at FROM expenses WHERE period_id=? ORDER BY fecha, id')
        .bind(pid)
        .all();
      return json({ ...period, gastos: results.map((g) => ({ ...g, tiene_soporte: !!g.tiene_soporte })) });
    }
    if (!sub && method === 'PATCH') {
      if (period.estado !== 'abierto') return fail(409, 'El período está cerrado. Reábrelo para editarlo.');
      const p = cleanPeriod(await readJson(request));
      await db.prepare('UPDATE periods SET nombre=?, fecha_inicio=?, saldo_inicial=? WHERE id=?').bind(p.nombre, p.fecha_inicio, p.saldo_inicial, pid).run();
      return json(await periodWithTotals(db, pid));
    }
    if (sub === 'close' && method === 'POST') {
      if (period.estado !== 'abierto') return fail(409, 'El período ya está cerrado.');
      await db.prepare("UPDATE periods SET estado='cerrado', closed_at=? WHERE id=?").bind(now(), pid).run();
      return json(await periodWithTotals(db, pid));
    }
    if (sub === 'reopen' && method === 'POST') {
      if (period.estado === 'abierto') return fail(409, 'El período ya está abierto.');
      const open = await openPeriod(db);
      if (open) return fail(409, `Primero cierra el período abierto ("${open.nombre}").`);
      await db.prepare("UPDATE periods SET estado='abierto', closed_at=NULL WHERE id=?").bind(pid).run();
      return json(await periodWithTotals(db, pid));
    }
  }

  // ----- Gastos -----
  if (res === 'expenses') {
    if (!id && method === 'POST') {
      const open = await openPeriod(db);
      if (!open) return fail(409, 'Inicia un período antes de registrar gastos.');
      const e = cleanExpense(await readJson(request));
      await checkDuplicate(db, e);
      const t = now();
      const r = await db
        .prepare('INSERT INTO expenses (period_id, proveedor, nit, factura, factura_norm, fecha, motivo, valor, funcionario, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(open.id, e.proveedor, e.nit, e.factura, e.factura_norm, e.fecha, e.motivo, e.valor, e.funcionario, t, t)
        .run();
      return json({ id: r.meta.last_row_id }, 201);
    }

    const eid = Number(id);
    const exp = await db.prepare('SELECT e.*, p.estado FROM expenses e JOIN periods p ON p.id=e.period_id WHERE e.id=?').bind(eid).first();
    if (!exp) return fail(404, 'Ese gasto no existe.');

    // Ver soporte
    if (sub === 'file' && method === 'GET') {
      if (!exp.file_key) return fail(404, 'Este gasto no tiene soporte.');
      const obj = await env.FILES.get(exp.file_key);
      if (!obj) return fail(404, 'No se encontró el soporte.');
      return new Response(obj.body, {
        headers: { 'content-type': exp.file_type || 'application/octet-stream', 'cache-control': 'private, max-age=3600' },
      });
    }

    if (exp.estado !== 'abierto') return fail(409, 'El período está cerrado. Reábrelo para hacer cambios.');

    // Subir o reemplazar soporte (el cuerpo es el archivo tal cual)
    if (sub === 'file' && method === 'PUT') {
      const type = (request.headers.get('content-type') || '').split(';')[0].trim();
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(type)) return fail(400, 'Formato no soportado. Usa JPG, PNG o PDF.');
      const len = Number(request.headers.get('content-length') || 0);
      if (len > maxMb(env) * 1024 * 1024) return fail(413, `El archivo es muy grande (máximo ${maxMb(env)} MB).`);
      const key = `soportes/${exp.period_id}/${eid}-${crypto.randomUUID()}`;
      await env.FILES.put(key, request.body, { httpMetadata: { contentType: type } });
      const name = decodeURIComponent(request.headers.get('x-file-name') || '').slice(0, 200) || null;
      await db.prepare('UPDATE expenses SET file_key=?, file_type=?, file_name=?, updated_at=? WHERE id=?').bind(key, type, name, now(), eid).run();
      if (exp.file_key) await env.FILES.delete(exp.file_key);
      return json({ ok: true });
    }

    if (!sub && method === 'PATCH') {
      const e = cleanExpense(await readJson(request));
      await checkDuplicate(db, e, eid);
      await db
        .prepare('UPDATE expenses SET proveedor=?, nit=?, factura=?, factura_norm=?, fecha=?, motivo=?, valor=?, funcionario=?, updated_at=? WHERE id=?')
        .bind(e.proveedor, e.nit, e.factura, e.factura_norm, e.fecha, e.motivo, e.valor, e.funcionario, now(), eid)
        .run();
      return json({ ok: true });
    }
    if (!sub && method === 'DELETE') {
      await db.prepare('DELETE FROM expenses WHERE id=?').bind(eid).run();
      if (exp.file_key) await env.FILES.delete(exp.file_key);
      return json({ ok: true });
    }
  }

  return fail(404, 'No encontrado.');
}
