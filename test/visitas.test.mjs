// Pruebas del módulo de visitas contra el servidor local (npm run dev, base vacía, VISITAS_ON=1 en .dev.vars).
// Uso: BASE=http://localhost:8788 node test/visitas.test.mjs  (npm test lo corre antes de api.test.mjs)
// Siembra un panel de prueba con wrangler en la misma base local (D1_PERSIST si el servidor usa --persist-to).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hoyBogota, addDays, lunes, esHabil, diasHabiles } from '../lib/fechas.js';

const BASE = process.env.BASE || 'http://localhost:8788';
let cookie = '';
async function api(method, path, body) {
  const res = await fetch(BASE + '/api/' + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, data: await res.json() };
}
const ok = (name) => console.log('✓', name);
const sql = (text) => {
  writeFileSync('.test-seed.sql', text);
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'visita-demo-db', '--local', ...(process.env.D1_PERSIST ? ['--persist-to', process.env.D1_PERSIST] : []), '--file', '.test-seed.sql'], { stdio: 'ignore' });
};
const hoy = hoyBogota();
let D = addDays(hoy, 1); // próximo día hábil después de hoy
while (!esHabil(D)) D = addDays(D, 1);
let sab = addDays(lunes(hoy), 5);

let r = await api('POST', 'login', { pin: '1234' });
assert.equal(r.status, 200);
r = await api('GET', 'me');
assert.equal(r.data.visitas, true); ok('módulo de visitas encendido en local');

// ----- Ciclos (relativos a hoy) -----
const ini = addDays(lunes(hoy), -14), fin = addDays(lunes(hoy), 30);
r = await api('POST', 'cycles', { numero: 10, fecha_inicio: ini, fecha_fin: addDays(ini, -3) });
assert.equal(r.status, 400); ok('ciclo con fin antes del inicio se rechaza');
r = await api('POST', 'cycles', { numero: 10, fecha_inicio: ini, fecha_fin: fin });
assert.equal(r.status, 201); assert.ok(r.data.dias_habiles > 20); const c10 = r.data.id; ok('crear ciclo y contar días hábiles');
r = await api('POST', 'cycles', { numero: 11, fecha_inicio: fin, fecha_fin: addDays(fin, 28) });
assert.equal(r.status, 409); assert.match(r.data.error, /cruza/); ok('ciclos que se cruzan se rechazan');
r = await api('POST', 'cycles', { numero: 11, fecha_inicio: addDays(fin, 1), fecha_fin: addDays(fin, 28) });
assert.equal(r.status, 201); ok('ciclo siguiente');
r = await api('PATCH', 'cycles/' + c10, { numero: 10, fecha_inicio: ini, fecha_fin: addDays(fin, 1) });
assert.equal(r.status, 409); ok('editar ciclo sin cruzarse con el siguiente');
r = await api('GET', 'cycles');
assert.equal(r.data.length, 2); assert.equal(r.data[0].numero, 11); ok('listar ciclos (el más reciente primero)');

// ----- Panel de prueba -----
const t = new Date().toISOString();
sql(`INSERT INTO people (id, nombre, esp, institucion, ciudad, frecuencia, created_at) VALUES
  (1,'ANA DOBLE','ONC','CLINICA UNO','CALI',2,'${t}'), (2,'BETO UNO','URO','CLINICA UNO','CALI',1,'${t}'),
  (3,'CARLA PASTO','QUF','HOSPITAL DOS','PASTO',1,'${t}'), (4,'DARIO CERO','HEM','CLINICA UNO','CALI',0,'${t}');
INSERT INTO pharmacies (id, nombre, ciudad) VALUES (1,'FARMACIA UNO','CALI'), (2,'FARMACIA DOS','PASTO');
INSERT INTO visits (id, fecha, franja, orden, tipo, person_id, lugar, created_at, updated_at) VALUES
  (100,'${hoy}','AM',0,'persona',1,'CLINICA UNO','${t}','${t}'),
  (101,'${addDays(hoy, -1)}','AM',0,'persona',3,'HOSPITAL DOS','${t}','${t}');`);

// ----- Disponibles -----
r = await api('GET', 'available?fecha=' + D);
assert.equal(r.status, 200);
const P = (id) => r.data.personas.find((p) => p.id === id);
assert.equal(P(1).pendiente, 1); assert.match(P(1).nota, /Programada/); assert.equal(P(2).pendiente, 1); assert.equal(P(4).pendiente, 0);
assert.match(P(3).nota, /No realizada/); assert.equal(r.data.farmacias.length, 2); ok('disponibles: frecuencia, programadas, frecuencia 0 y "no realizada"');

// ----- Agregar -----
r = await api('POST', 'visits', { fecha: addDays(hoy, -1), items: [{ tipo: 'persona', id: 2, franja: 'AM' }] });
assert.equal(r.status, 409); ok('no se agrega a días pasados');
r = await api('POST', 'visits', { fecha: sab, items: [{ tipo: 'persona', id: 2, franja: 'AM' }] });
assert.equal(r.status, 409); ok('no se agrega a sábados');
r = await api('POST', 'visits', { fecha: D, items: [{ tipo: 'persona', id: 2, franja: 'AM' }, { tipo: 'farmacia', id: 1, franja: 'PM' }, { tipo: 'persona', id: 3, franja: 'AM', lugar: 'CLINICA TRES' }] });
assert.equal(r.status, 201); assert.equal(r.data.agregadas, 3); ok('agregar contactos y farmacia en una sola acción (AM y PM)');
r = await api('POST', 'visits', { fecha: D, items: [{ tipo: 'persona', id: 2, franja: 'PM' }] });
assert.equal(r.status, 409); ok('nunca dos visitas a la misma persona el mismo día');

r = await api('GET', 'available?fecha=' + addDays(D, 7 - ((new Date(D).getUTCDay() + 6) % 7) ));
const otra = r.data.personas.find((p) => p.id === 2);
assert.equal(otra.pendiente, 0); assert.match(otra.nota, /Programada/); ok('frecuencia 1 ya programada no queda pendiente en otra fecha');

// ----- Semana -----
r = await api('GET', 'week?lunes=' + lunes(D));
const dia = r.data.dias.find((d) => d.fecha === D);
assert.deepEqual(dia.visitas.map((v) => [v.nombre, v.franja]), [['BETO UNO', 'AM'], ['CARLA PASTO', 'AM'], ['FARMACIA UNO', 'PM']]);
assert.equal(dia.visitas[1].lugar, 'CLINICA TRES'); assert.equal(dia.visitas[0].estado, D === hoy ? 'por_hacer' : 'programada');
assert.equal(r.data.dias.length, 5); ok('semana: visitas por día, franja y orden');
const [vBeto, vCarla, vFarm] = dia.visitas.map((v) => v.id);

r = await api('POST', 'visits/reorder', { fecha: D, franja: 'PM', ids: [vCarla, vFarm] });
assert.equal(r.status, 200);
r = await api('GET', 'week?lunes=' + lunes(D));
assert.deepEqual(r.data.dias.find((d) => d.fecha === D).visitas.map((v) => v.nombre + ' ' + v.franja), ['BETO UNO AM', 'CARLA PASTO PM', 'FARMACIA UNO PM']);
ok('mover de AM a PM y reordenar');

// ----- Estados -----
r = await api('POST', `visits/${vBeto}/estado`, { resultado: 'realizada' });
assert.equal(r.status, 409); ok('no se marca una visita futura');
r = await api('POST', 'visits/100/estado', { resultado: 'realizada' });
assert.equal(r.data.estado, 'pendiente'); ok('marcar realizada → pendiente reporte');
r = await api('POST', 'visits/101/estado', { resultado: 'no_efectiva' });
assert.equal(r.data.estado, 'ne_pendiente'); ok('marcar no efectiva un día anterior');
r = await api('GET', 'week?lunes=' + lunes(hoy));
assert.equal(r.data.pendientes_reporte[0].fecha, addDays(hoy, -1)); ok('aviso de días anteriores sin reporte en la app');
r = await api('POST', 'visits/101/reporte', { via: 'tablet' });
assert.equal(r.data.estado, 'ne_listo');
r = await api('GET', 'week?lunes=' + lunes(hoy));
assert.equal(r.data.pendientes_reporte.length, 0); ok('"Ya lo reporté en la tablet" quita el aviso');

const antes = r.data.ciclo.contactos;
r = await api('POST', 'visits/100/reporte', { via: 'copia' });
assert.equal(r.data.estado, 'listo');
r = await api('GET', 'week?lunes=' + lunes(hoy));
assert.equal(r.data.ciclo.contactos, antes + 1); assert.equal(r.data.ciclo.numero, 10);
assert.equal(r.data.ciclo.meta_contactos, 9 * r.data.ciclo.dias_habiles); ok('reporte listo cuenta para la meta del ciclo (las no efectivas no)');

r = await api('GET', 'available?fecha=' + D);
assert.equal(r.data.personas.find((p) => p.id === 1).pendiente, 1); assert.equal(r.data.personas.find((p) => p.id === 3).en_fecha, true);
ok('doble contacto con una visita hecha queda con 1 pendiente; marca quién ya está en el día');

// ----- Lugar, quitar y volver a "Por hacer" -----
r = await api('PATCH', 'visits/' + vBeto, { lugar: 'CLINICA NUEVA' });
assert.equal(r.data.lugar, 'CLINICA NUEVA'); ok('cambiar el lugar');
r = await api('DELETE', 'visits/100');
assert.equal(r.status, 409); ok('no se quita una visita ya marcada');
r = await api('POST', 'visits/100/estado', { resultado: null });
assert.equal(r.data.estado, 'por_hacer'); assert.equal(r.data.reporte_listo, false); ok('volver a "Por hacer" limpia el reporte');
r = await api('DELETE', 'visits/100');
assert.equal(r.status, 200); ok('quitar de la planeación');

// ----- Reporte (fase 2) -----
sql(`INSERT INTO visits (id, fecha, franja, orden, tipo, person_id, lugar, resultado, marca, created_at, updated_at) VALUES
  (200,'${addDays(hoy, -20)}','AM',0,'persona',2,'CLINICA UNO','realizada','novaclot-septivan','${t}','${t}'),
  (201,'${hoy}','PM',0,'persona',2,'CLINICA UNO',NULL,NULL,'${t}','${t}');
INSERT INTO visits (id, fecha, franja, orden, tipo, pharmacy_id, lugar, created_at, updated_at) VALUES (202,'${hoy}','PM',1,'farmacia',1,'FARMACIA UNO','${t}','${t}');`);
r = await api('GET', 'visits/201');
assert.equal(r.data.marca, null); assert.equal(r.data.marca_sugerida, 'novaclot-septivan'); assert.equal(r.data.comentario, '');
ok('reporte: sugiere la marca de la última visita a la persona');
r = await api('PATCH', 'visits/201', { marca: 'vankina' });
assert.equal(r.status, 400); ok('marca que no existe se rechaza');
r = await api('PATCH', 'visits/201', { marca: 'novaclot', notas: 'pidió muestras', comentario: 'NOVACLOT en diferentes… pidió muestras' });
assert.equal(r.data.marca, 'novaclot'); assert.equal(r.data.notas, 'pidió muestras'); assert.equal(r.data.lugar, 'CLINICA UNO'); assert.equal(r.data.estado, 'por_hacer');
ok('guardar borrador del reporte sin cambiar el estado ni el lugar');
r = await api('PATCH', 'visits/202', { medicamentos: ['SEPTIVAN', 'NOVACLOT', 'OTRO'] });
assert.equal(r.status, 400);
r = await api('PATCH', 'visits/202', { medicamentos: ['SEPTIVAN', 'NOVACLOT'] });
assert.deepEqual(r.data.medicamentos, ['NOVACLOT', 'SEPTIVAN']); ok('farmacia: medicamentos válidos, en orden fijo');
r = await api('POST', 'visits/201/reporte', { via: 'copia', comentario: 'texto final', objetivo: 'objetivo final' });
assert.equal(r.data.estado, 'listo'); assert.equal(r.data.comentario, 'texto final'); assert.equal(r.data.marca, 'novaclot');
ok('copiar el comentario guarda el texto y deja el reporte listo');
r = await api('POST', 'compose', { texto: '   ', campo: 'comentario' });
assert.equal(r.status, 200); assert.equal(r.data.texto, ''); ok('ajustar texto vacío no llama a la IA');
r = await api('POST', 'transcribe', undefined);
assert.ok([400, 503].includes(r.status)); ok('dictado sin audio (o sin Workers AI en local) responde con un error claro');

// ----- Chip de farmacias al planear (igual que médicos) -----
// Farmacia 2: no efectiva ayer y programada en D+1 → "Programada"; al planear D+1 no se cuenta esa misma visita.
let D2 = addDays(D, 1); while (!esHabil(D2)) D2 = addDays(D2, 1);
sql(`INSERT INTO visits (id, fecha, franja, orden, tipo, pharmacy_id, lugar, resultado, created_at, updated_at) VALUES
  (300,'${addDays(hoy, -1)}','AM',0,'farmacia',2,'FARMACIA DOS','no_efectiva','${t}','${t}'),
  (301,'${D2}','AM',0,'farmacia',2,'FARMACIA DOS',NULL,'${t}','${t}');`);
r = await api('GET', 'available?fecha=' + D);
assert.match(r.data.farmacias.find((f) => f.id === 2).nota, /^Programada /); ok('farmacia con visita agendada muestra "Programada"');
r = await api('GET', 'available?fecha=' + D2);
assert.match(r.data.farmacias.find((f) => f.id === 2).nota, /^No efectiva el /); ok('farmacia: sin otra agendada muestra la última que no se hizo');

// ----- Semana: esperado a hoy -----
r = await api('GET', 'week?lunes=' + lunes(hoy));
const transS = r.data.dias.filter((d) => d.habil && d.fecha < hoy).length;
assert.equal(r.data.semana.esperado_contactos, 9 * transS); assert.equal(r.data.semana.esperado_farmacias, 3 * transS);
r = await api('GET', 'week?lunes=' + addDays(lunes(hoy), 14));
assert.equal(r.data.semana.esperado_contactos, 0); ok('semana: esperado = meta diaria × días hábiles ya terminados, hasta ayer (0 en semanas futuras)');
r = await api('GET', 'week');
{ const c = r.data.ciclo; const cerr = diasHabiles(c.fecha_inicio, c.fecha_fin).filter((d) => d < hoy).length;
  assert.equal(c.meta_contactos_fecha, 9 * cerr); assert.equal(c.meta_farmacias_fecha, 3 * cerr); assert.equal(c.dia, cerr + (esHabil(hoy) ? 1 : 0)); }
ok('ciclo: esperado hasta ayer; "día N" sigue contando hoy');

execFileSync('rm', ['-f', '.test-seed.sql']);
console.log('\nTodo bien.');
