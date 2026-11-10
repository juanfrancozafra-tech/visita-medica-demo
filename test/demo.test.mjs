// Pruebas del modo demo contra el servidor local con DEMO_MODE=1.
// Uso: npm run dev:demo (en otra terminal) y luego BASE=http://localhost:8789 npm run test:demo
import assert from 'node:assert/strict';
import { hoyBogota } from '../lib/fechas.js';

const BASE = process.env.BASE || 'http://localhost:8789';
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
  return { status: res.status, data: ct.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
}
const ok = (name) => console.log('✓', name);

let r = await api('GET', 'info');
assert.equal(r.data.demo, true); assert.equal(r.data.pin, '1234'); ok('la pantalla de ingreso muestra el PIN de la demo');

r = await api('POST', 'login', { pin: '1234' });
assert.equal(r.status, 200);
r = await api('GET', 'me');
assert.equal(r.data.demo, true); assert.equal(r.data.visitas, true); assert.equal(r.data.config.maxFileMb, 3);
assert.equal(r.data.config.empresa, 'Laboratorios Nexalia'); ok('modo demo: visitas encendidas, límite de 3 MB y empresa ficticia');

// Datos sembrados
r = await api('GET', 'week');
const visitasSemana = r.data.dias.reduce((n, d) => n + d.visitas.length, 0);
assert.ok(visitasSemana > 20, 'la semana tiene visitas');
assert.equal(r.data.ciclo.numero, 10); assert.equal(r.data.ciclo.dias_habiles, 20);
assert.ok(r.data.ciclo.contactos > 50, 'el ciclo ya lleva contactos con reporte');
ok(`semana sembrada (${visitasSemana} visitas) y ciclo 10 en el día ${r.data.ciclo.dia} de 20`);
const hoy = hoyBogota();
const dHoy = r.data.dias.find((d) => d.fecha === hoy);
if (dHoy && dHoy.habil) {
  assert.ok(dHoy.visitas.some((v) => v.estado === 'por_hacer')); ok('hoy hay visitas por hacer');
}
assert.ok(r.data.pendientes_reporte.length >= 1); ok('hay un aviso de visitas sin reporte de días anteriores');

r = await api('GET', 'periods');
assert.equal(r.data.length, 2);
const abierto = r.data.find((p) => p.estado === 'abierto');
const pct = (abierto.total / abierto.saldo_inicial) * 100;
assert.ok(pct >= 70 && pct < 100, 'el período abierto va entre 70% y 100%: ' + pct);
ok(`dos períodos (uno cerrado) y el abierto al ${Math.round(pct)}%`);

r = await api('GET', 'periods/' + abierto.id);
const conSoporte = r.data.gastos.find((g) => g.tiene_soporte);
assert.ok(r.data.gastos.some((g) => !g.tiene_soporte)); ok('un gasto sin soporte para ver el aviso');
r = await api('GET', `expenses/${conSoporte.id}/file`);
assert.equal(r.status, 200); assert.equal(new TextDecoder().decode(r.data.slice(0, 5)), '%PDF-'); ok('los soportes de ejemplo son PDF');

// IA simulada
r = await api('POST', 'extract', 'aGVsbG8=', { 'content-type': 'image/jpeg' });
assert.equal(r.status, 200); assert.ok(r.data.proveedor && r.data.nit && r.data.factura && r.data.valor > 0); assert.match(r.data.notas, /Demo/);
const leida = r.data; ok('lectura de factura simulada');
r = await api('POST', 'transcribe', 'x');
assert.equal(r.status, 200); assert.match(r.data.texto, /^eh bueno/); ok('dictado simulado');
r = await api('POST', 'compose', { texto: r.data.texto, campo: 'comentario' });
assert.equal(r.status, 200);
assert.ok(!/\b(eh|bueno|o sea|pues)\b/i.test(r.data.texto), 'sin muletillas: ' + r.data.texto);
assert.match(r.data.texto, /NOVACLOT/); assert.match(r.data.texto, /^El doctor/); ok('ajuste local del texto: ' + r.data.texto);

// Archivos con límite de la demo
r = await api('POST', 'expenses', { ...leida, motivo: 'Relacionamiento profesional', funcionario: 'Dra. Ana Pérez' });
assert.equal(r.status, 201); const nuevo = r.data.id; ok('registrar el gasto leído');
r = await api('PUT', `expenses/${nuevo}/file`, new Uint8Array(4 * 1024 * 1024), { 'content-type': 'image/jpeg' });
assert.equal(r.status, 413); ok('archivo de más de 3 MB se rechaza');
r = await api('PUT', `expenses/${nuevo}/file`, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { 'content-type': 'image/jpeg' });
assert.equal(r.status, 200); ok('archivo pequeño se guarda');

// Reiniciar
r = await api('POST', 'demo/reset');
assert.equal(r.status, 200); assert.ok(r.data.visitas > 50);
r = await api('GET', 'periods/' + abierto.id);
assert.ok(!r.data.gastos.some((g) => g.factura === leida.factura)); ok('reiniciar borra lo agregado y vuelve a los datos de ejemplo');
r = await api('POST', 'demo/reset');
assert.equal(r.status, 429); ok('no se puede reiniciar dos veces seguidas');

// En la demo no aplica el bloqueo global del PIN (sí el de cada IP)
cookie = '';
for (let i = 0; i < 21; i++) await api('POST', 'login', { pin: '0000' }, { 'cf-connecting-ip': '10.0.0.' + i });
r = await api('POST', 'login', { pin: '1234' }, { 'cf-connecting-ip': '10.0.1.1' });
assert.equal(r.status, 200); ok('PIN público: fallos de otras IP no bloquean el ingreso');

console.log('\nTodo bien.');
