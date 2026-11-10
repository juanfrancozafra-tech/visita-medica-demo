// Pruebas de la API contra el servidor local (npm run dev, con APP_PIN=1234 en .dev.vars y base vacía).
// Uso: BASE=http://localhost:8788 node test/api.test.mjs
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:8788';
let cookie = '';
async function api(method, path, body, headers = {}) {
  const isRaw = body instanceof Uint8Array || typeof body === 'string';
  const res = await fetch(BASE + '/api/' + path, {
    method,
    headers: { ...(body && !isRaw ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? (isRaw ? body : JSON.stringify(body)) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : await res.arrayBuffer() };
}
const ok = (name) => console.log('✓', name);

const gasto = (factura, extra = {}) => ({
  proveedor: 'CAFÉ DEL PARQUE SAS', nit: '901000101', factura, fecha: '2026-07-17',
  motivo: 'Relacionamiento profesional: SOCIALIZACIÓN DE CONCEPTOS MÉDICOS', valor: 151500, funcionario: 'Dra. Ana Pérez', ...extra,
});

let r = await api('GET', 'me');
assert.equal(r.status, 401); ok('sin sesión -> 401');

r = await api('POST', 'login', { pin: '0000' });
assert.equal(r.status, 401); ok('PIN incorrecto');

r = await api('POST', 'login', { pin: '1234' });
assert.equal(r.status, 200); assert.ok(cookie.startsWith('sid=')); ok('login');

r = await api('POST', 'expenses', gasto('X1'));
assert.equal(r.status, 409); ok('no se registra sin período');

r = await api('POST', 'periods', { nombre: '', fecha_inicio: '2026-07-01', saldo_inicial: 500000 });
assert.equal(r.status, 400); ok('período requiere nombre');

r = await api('POST', 'periods', { nombre: 'Julio 2026', fecha_inicio: '2026-07-01', saldo_inicial: 500000 });
assert.equal(r.status, 201); const p1 = r.data.id; ok('crear período');

r = await api('POST', 'periods', { nombre: 'Otro', fecha_inicio: '2026-08-01', saldo_inicial: 500000 });
assert.equal(r.status, 409); ok('solo un período abierto');

r = await api('POST', 'expenses', gasto('FEPS3414'));
assert.equal(r.status, 201); const e1 = r.data.id; ok('crear gasto');

r = await api('POST', 'expenses', gasto('feps 3414'));
assert.equal(r.status, 409); assert.match(r.data.error, /ya está registrada/); ok('factura duplicada bloqueada (normalizada)');

r = await api('POST', 'expenses', gasto('FEPS3414', { nit: '901.000.101-1' }));
assert.equal(r.status, 409); ok('duplicado detectado con NIT en otro formato');

r = await api('POST', 'expenses', gasto('FEPS3414', { proveedor: 'OTRO CAFÉ SAS', nit: '800111222', valor: 10000 }));
assert.equal(r.status, 201); const eOtro = r.data.id; ok('mismo número de factura de otro NIT se acepta');
r = await api('DELETE', 'expenses/' + eOtro);
assert.equal(r.status, 200); ok('borrar gasto');

r = await api('POST', 'expenses', gasto('X2', { funcionario: '' }));
assert.equal(r.status, 400); ok('campos obligatorios');

r = await api('POST', 'expenses', gasto('STJP327269', { fecha: '2026-07-01', valor: 400000 }));
assert.equal(r.status, 201); const e2 = r.data.id; ok('gasto que deja saldo negativo se acepta');

r = await api('GET', 'periods/' + p1);
assert.equal(r.data.total, 551500); assert.equal(r.data.disponible, -51500); assert.equal(r.data.transacciones, 2);
assert.equal(r.data.gastos[0].factura, 'STJP327269'); ok('totales y orden por fecha');

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
r = await api('PUT', `expenses/${e1}/file`, png, { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('recibo ñ.png') });
assert.equal(r.status, 200); ok('subir soporte');
r = await api('GET', `expenses/${e1}/file`);
assert.equal(r.status, 200); assert.equal(new Uint8Array(r.data).length, png.length); ok('descargar soporte');

r = await api('PATCH', 'expenses/' + e2, gasto('FEPS3414'));
assert.equal(r.status, 409); ok('editar a factura duplicada bloqueado');
r = await api('PATCH', 'expenses/' + e2, gasto('STJP327269', { valor: 37400, fecha: '2026-07-01' }));
assert.equal(r.status, 200); ok('editar gasto');

r = await api('PATCH', 'periods/' + p1, { nombre: 'Julio 2026 (Cali)', fecha_inicio: '2026-07-01', saldo_inicial: 600000 });
assert.equal(r.status, 200); assert.equal(r.data.disponible, 600000 - 188900); ok('editar período');

r = await api('POST', `periods/${p1}/close`);
assert.equal(r.data.estado, 'cerrado'); ok('cerrar período');
r = await api('PATCH', 'expenses/' + e2, gasto('STJP327269'));
assert.equal(r.status, 409); ok('período cerrado no se edita');
r = await api('GET', `expenses/${e1}/file`);
assert.equal(r.status, 200); ok('soporte visible en período cerrado');

r = await api('POST', 'periods', { nombre: 'Agosto 2026', fecha_inicio: '2026-08-01', saldo_inicial: 500000 });
assert.equal(r.status, 201); const p2 = r.data.id; ok('nuevo período tras cerrar');
r = await api('POST', `periods/${p1}/reopen`);
assert.equal(r.status, 409); ok('no reabre con otro abierto');
r = await api('POST', `periods/${p2}/close`);
r = await api('POST', `periods/${p1}/reopen`);
assert.equal(r.data.estado, 'abierto'); ok('reabrir');

r = await api('DELETE', 'expenses/' + e1);
assert.equal(r.status, 200); ok('eliminar gasto');
r = await api('GET', 'periods');
assert.equal(r.data.length, 2); ok('listar períodos');

r = await api('POST', 'logout');
r = await api('GET', 'me');
assert.equal(r.status, 401); ok('logout');
// Bloqueo global del PIN: muchos intentos desde IPs distintas (como un ataque que rota IPs).
for (let i = 0; i < 20; i++) {
  r = await api('POST', 'login', { pin: '9999' }, { 'cf-connecting-ip': '10.0.0.' + i });
  assert.equal(r.status, 401);
}
r = await api('POST', 'login', { pin: '1234' }, { 'cf-connecting-ip': '10.0.1.1' });
assert.equal(r.status, 429); assert.match(r.data.error, /bloqueado/); ok('bloqueo global tras 20 fallos en una hora, aunque el PIN sea correcto');

console.log('\nTodo bien.');
