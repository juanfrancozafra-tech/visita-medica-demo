// Pruebas de festivos y días hábiles (no necesitan servidor). Uso: node test/fechas.test.mjs
import assert from 'node:assert/strict';
import { festivos, festivo, diasHabiles, hoyBogota, lunes, esFecha, fechaFactura } from '../lib/fechas.js';
const ok = (n) => console.log('✓', n);

// Calendario oficial 2026: 18 festivos.
assert.deepEqual([...festivos(2026).keys()].sort(), [
  '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18',
  '2026-06-08', '2026-06-15', '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12',
  '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
]); ok('festivos 2026');
assert.equal(festivo('2027-03-25'), 'Jueves Santo'); assert.equal(festivo('2027-11-15'), 'Independencia de Cartagena'); ok('festivos 2027');
assert.equal(diasHabiles('2026-10-26', '2026-11-06').length, 9); ok('días hábiles saltan fines de semana y el 2 de noviembre');
assert.equal(lunes('2026-10-29'), '2026-10-26'); assert.equal(lunes('2026-11-01'), '2026-10-26'); ok('lunes de la semana');
assert.equal(hoyBogota(Date.parse('2026-10-28T03:30:00Z')), '2026-10-27'); ok('hoy en Bogotá (10:30 pm del 27 sigue siendo 27)');
assert.ok(esFecha('2026-02-28') && !esFecha('2026-02-30') && !esFecha('28/02/2026')); ok('validación de fecha');
const H = '2026-11-09';
assert.deepEqual(fechaFactura('2026-03-11', '03/11/2026', H), { fecha: '2026-11-03', nota: '' }); ok('factura: el texto impreso día/mes manda sobre la IA');
assert.equal(fechaFactura('2026-04-11', '04-11-26 13:05', H).fecha, '2026-11-04'); ok('factura: año de 2 dígitos');
assert.equal(fechaFactura('', '3 NOV. 2026', H).fecha, '2026-11-03'); ok('factura: mes en letras');
assert.equal(fechaFactura('2026-11-03', '2026-11-03 14:22', H).fecha, '2026-11-03'); ok('factura: AAAA-MM-DD');
const inv = fechaFactura('2026-03-11', '', H); assert.equal(inv.fecha, '2026-11-03'); assert.ok(inv.nota); ok('factura: día y mes invertidos se corrigen con aviso');
const lejos = fechaFactura('2025-11-03', '', H); assert.equal(lejos.fecha, '2025-11-03'); assert.ok(lejos.nota); ok('factura: fecha lejana se deja con aviso');
assert.deepEqual(fechaFactura('2026-10-09', '09/10/2026', H), { fecha: '2026-10-09', nota: '' }); ok('factura: ambas fechas posibles → día primero');
assert.equal(fechaFactura('basura', '', H).fecha, ''); ok('factura: sin fecha válida queda vacía');
console.log('\nTodo bien.');
