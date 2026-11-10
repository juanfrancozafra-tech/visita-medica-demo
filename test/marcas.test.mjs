// Armado de los textos del reporte (sin servidor). Uso: node test/marcas.test.mjs
import assert from 'node:assert/strict';
import { armar, enumerar, unir, MARCAS, LIMITE } from '../public/marcas.js';
import { normalizar } from '../lib/redactar.js';
const ok = (n) => console.log('✓', n);

assert.equal(enumerar(['A']), 'A'); assert.equal(enumerar(['A', 'B']), 'A y B'); assert.equal(enumerar(['A', 'B', 'C']), 'A, B y C'); ok('enumerar');
assert.equal(unir('Mensaje.', 'nota'), 'Mensaje. nota'); assert.equal(unir('Sin punto', 'nota'), 'Sin punto. nota');
assert.equal(unir('Mensaje.', ''), 'Mensaje.'); assert.equal(unir('', 'nota'), 'nota'); ok('unir mensaje y nota');

const cl = MARCAS.find((m) => m.id === 'novaclot');
let r = armar({ tipo: 'persona', resultado: 'realizada', marca: 'novaclot' }, 'el doctor pidió muestras.', '');
assert.equal(r.comentario, cl.comentario + ' el doctor pidió muestras.'); assert.equal(r.objetivo, cl.objetivo); ok('contacto: mensaje primero y luego la nota');
r = armar({ tipo: 'persona', resultado: 'realizada', marca: 'ninguna' }, 'solo nota', '');
assert.equal(r.comentario, 'solo nota'); assert.equal(r.objetivo, ''); ok('sin marca: solo la nota');
r = armar({ tipo: 'persona', resultado: 'no_efectiva', marca: 'novaclot' }, 'estaba en cirugía', '');
assert.equal(r.comentario, 'Visita no efectiva. estaba en cirugía'); assert.equal(r.objetivo, ''); ok('no efectiva: sin marca y objetivo en blanco');
r = armar({ tipo: 'farmacia', resultado: 'realizada', medicamentos: ['SEPTIVAN', 'NOVACLOT'] }, '', '');
assert.match(r.comentario, /^Actualmente con inventario de NOVACLOT y SEPTIVAN, para atención/); assert.equal(r.objetivo, 'Realizar seguimiento a convenios y rotación');
ok('farmacia: MEDICAMENTO se reemplaza');

assert.equal(normalizar('El Doctor de la Clínica del Valle pidió Novaclot y septivan. la EPS no autoriza. ¿novaclot? sí'), 'El doctor de la clínica del valle pidió NOVACLOT y SEPTIVAN. La eps no autoriza. ¿NOVACLOT? Sí');
assert.equal(normalizar('novaclot llegó'), 'NOVACLOT llegó'); ok('minúsculas, mayúscula al iniciar oración y medicamentos en MAYÚSCULA');
for (const m of MARCAS) assert.ok(m.comentario.length < LIMITE && m.objetivo.length < LIMITE);
for (const m of MARCAS) assert.ok(!/\b(novaclot|oralix|septivan|anestril)\b/.test(m.comentario + m.objetivo), 'medicamento en minúscula en ' + m.id);
ok('mensajes de marca bajo el límite y con medicamentos en MAYÚSCULA');
console.log('\nTodo bien.');
