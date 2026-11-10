// Fechas en hora de Colombia, días hábiles y festivos (Ley 51 de 1983, "Ley Emiliani").
// Todas las fechas son texto AAAA-MM-DD; se opera en UTC para no depender del huso del servidor.

const DIA = 86400000;
const toDate = (s) => new Date(s + 'T00:00:00Z');
const toStr = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => toStr(new Date(toDate(s).getTime() + n * DIA));
export const weekday = (s) => toDate(s).getUTCDay(); // 0 domingo … 6 sábado

// "Hoy" en Bogotá (UTC-5 todo el año, sin horario de verano).
export const hoyBogota = (ms = Date.now()) => toStr(new Date(ms - 5 * 3600000));

// Lunes de la semana de una fecha.
export const lunes = (s) => addDays(s, -((weekday(s) + 6) % 7));

// Domingo de Pascua (algoritmo de Meeus/Butcher para el calendario gregoriano).
function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
// Si no cae lunes, pasa al lunes siguiente.
const alLunes = (s) => (weekday(s) === 1 ? s : addDays(s, (8 - weekday(s)) % 7));

const cache = new Map();
// Mapa fecha -> nombre del festivo para un año.
export function festivos(y) {
  if (cache.has(y)) return cache.get(y);
  const f = (md) => `${y}-${md}`;
  const p = pascua(y);
  const lista = [
    [f('01-01'), 'Año Nuevo'],
    [alLunes(f('01-06')), 'Reyes Magos'],
    [alLunes(f('03-19')), 'San José'],
    [addDays(p, -3), 'Jueves Santo'],
    [addDays(p, -2), 'Viernes Santo'],
    [f('05-01'), 'Día del Trabajo'],
    [addDays(p, 43), 'Ascensión del Señor'],
    [addDays(p, 64), 'Corpus Christi'],
    [addDays(p, 71), 'Sagrado Corazón'],
    [alLunes(f('06-29')), 'San Pedro y San Pablo'],
    [f('07-20'), 'Independencia'],
    [f('08-07'), 'Batalla de Boyacá'],
    [alLunes(f('08-15')), 'Asunción de la Virgen'],
    [alLunes(f('10-12')), 'Día de la Raza'],
    [alLunes(f('11-01')), 'Todos los Santos'],
    [alLunes(f('11-11')), 'Independencia de Cartagena'],
    [f('12-08'), 'Inmaculada Concepción'],
    [f('12-25'), 'Navidad'],
  ];
  const m = new Map(lista);
  cache.set(y, m);
  return m;
}
export const festivo = (s) => festivos(Number(s.slice(0, 4))).get(s) || null;

// Día hábil = lunes a viernes que no es festivo.
export const esHabil = (s) => weekday(s) >= 1 && weekday(s) <= 5 && !festivo(s);

// Días hábiles entre dos fechas, ambas incluidas.
export function diasHabiles(desde, hasta) {
  const out = [];
  for (let s = desde; s <= hasta; s = addDays(s, 1)) if (esHabil(s)) out.push(s);
  return out;
}

export const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toStr(toDate(s)) === s;

// ----- Fecha de una factura leída por la IA -----
// En Colombia la fecha se imprime día/mes/año: "03/11/2026" es 3 de noviembre, no 11 de marzo.
// Se arma la fecha desde el texto impreso (día primero) y, si queda lejos de hoy pero al invertir
// día y mes queda cerca, se invierte (algunas cajas imprimen mes/día). Devuelve { fecha, nota }.
const MES_TXT = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const ymd = (y, m, d) => `${String(y).length === 2 ? '20' + y : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function deTexto(t) {
  let m = t.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); // 2026-11-03
  if (m) return ymd(m[1], m[2], m[3]);
  m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/); // 03/11/2026 → día/mes/año
  if (m) return ymd(m[3], m[2], m[1]);
  m = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/(\d{1,2})[\s\/\-.]*(?:de\s+)?([a-z]{3})[a-z]*[\s\/\-.]*(?:de\s+)?(\d{4}|\d{2})(?!\d)/); // 3 nov 2026
  if (m && MES_TXT[m[2]]) return ymd(m[3], MES_TXT[m[2]], m[1]);
  return '';
}

export function fechaFactura(modelo, impresa, hoy) {
  let fecha = deTexto(String(impresa || ''));
  if (!esFecha(fecha)) fecha = esFecha(modelo) ? modelo : '';
  if (!fecha) return { fecha: '', nota: '' };
  const cerca = (s) => s <= addDays(hoy, 1) && s >= addDays(hoy, -120);
  if (cerca(fecha)) return { fecha, nota: '' };
  const inv = ymd(fecha.slice(0, 4), fecha.slice(8, 10), fecha.slice(5, 7));
  if (esFecha(inv) && cerca(inv)) return { fecha: inv, nota: `Revisa la fecha: se leyó ${fecha} y se cambió a ${inv} (día y mes estaban invertidos).` };
  return { fecha, nota: `Revisa la fecha: ${fecha} está lejos de hoy.` };
}
