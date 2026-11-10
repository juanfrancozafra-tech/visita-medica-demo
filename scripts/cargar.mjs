// Carga el panel o las farmacias desde un CSV a D1 (los mantiene el administrador; cambian casi nunca).
//
//   npm run cargar -- panel                     → base en Cloudflare (visita-demo-db)
//   npm run cargar -- panel --local             → base local de `npm run dev`
//   npm run cargar -- exportar panel → descarga lo que hay en la base a data/panel.exportado.csv
//   npm run cargar -- visitas                   → carga inicial: visitas ya hechas en el ciclo (data/carga-inicial.csv)
//
// Archivos (fuera de git, son datos de personas reales):
//   data/panel.csv      nombre,esp,institucion,ciudad,frecuencia
//   data/farmacias.csv  nombre,ciudad
//   data/carga-inicial.csv  tipo(contacto|farmacia),nombre,ciudad,fecha(AAAA-MM-DD) — quedan realizadas y con reporte listo
// Quien ya no está en el CSV queda inactivo (no se borra, para no perder el historial de visitas).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { SCHEMA } from '../lib/db.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [cmd, what] = args.filter((a) => !a.startsWith('--'));
const db = 'visita-demo-db';
const where = flags.has('--local') ? ['--local'] : ['--remote'];
const wrangler = (extra) => execFileSync('npx', ['wrangler', 'd1', 'execute', db, ...where, ...(process.env.D1_PERSIST ? ['--persist-to', process.env.D1_PERSIST] : []), ...extra], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...data] = rows.filter((r) => r.some((c) => c.trim()));
  return data.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
const s = (v) => `'${String(v).replace(/'/g, "''")}'`;
const now = new Date().toISOString();

const TABLAS = {
  panel: {
    file: 'data/panel.csv',
    sql(rows) {
      for (const r of rows) {
        if (!r.nombre || !r.esp || !r.institucion || !r.ciudad) throw new Error('Fila incompleta: ' + JSON.stringify(r));
        const f = Number(r.frecuencia || 1);
        if (![0, 1, 2].includes(f)) throw new Error(`Frecuencia inválida para ${r.nombre}: ${r.frecuencia}`);
      }
      return [
        ...rows.map((r) => `INSERT INTO people (nombre, esp, institucion, ciudad, frecuencia, activo, created_at) VALUES (${s(r.nombre)},${s(r.esp)},${s(r.institucion)},${s(r.ciudad)},${Number(r.frecuencia || 1)},1,${s(now)})
  ON CONFLICT(nombre) DO UPDATE SET esp=excluded.esp, institucion=excluded.institucion, ciudad=excluded.ciudad, frecuencia=excluded.frecuencia, activo=1;`),
        `UPDATE people SET activo=0 WHERE nombre NOT IN (${rows.map((r) => s(r.nombre)).join(',')});`,
      ];
    },
    exportar: 'SELECT nombre, esp, institucion, ciudad, frecuencia FROM people WHERE activo=1 ORDER BY ciudad, institucion, nombre',
  },
  farmacias: {
    file: 'data/farmacias.csv',
    sql: (rows) => [
      ...rows.map((r) => `INSERT INTO pharmacies (nombre, ciudad, activo) VALUES (${s(r.nombre)},${s(r.ciudad)},1) ON CONFLICT(nombre, ciudad) DO UPDATE SET activo=1;`),
      `UPDATE pharmacies SET activo=0 WHERE (nombre || '|' || ciudad) NOT IN (${rows.map((r) => s(r.nombre + '|' + r.ciudad)).join(',')});`,
    ],
    exportar: 'SELECT nombre, ciudad FROM pharmacies WHERE activo=1 ORDER BY ciudad, nombre',
  },
};

TABLAS.visitas = {
  file: 'data/carga-inicial.csv',
  sql(rows) {
    for (const r of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) throw new Error('Fecha inválida (usa AAAA-MM-DD): ' + JSON.stringify(r));
      if (!['contacto', 'farmacia'].includes(r.tipo)) throw new Error('Tipo inválido (contacto o farmacia): ' + JSON.stringify(r));
    }
    // INSERT ... SELECT: si el nombre no existe en la base no inserta nada; el resumen final lo muestra.
    return rows.map((r) =>
      r.tipo === 'contacto'
        ? `INSERT OR IGNORE INTO visits (fecha, franja, orden, tipo, person_id, lugar, planeada, resultado, done_at, reporte_listo_at, reporte_via, created_at, updated_at)
  SELECT ${s(r.fecha)},'AM',99,'persona',id,institucion,0,'realizada',${s(now)},${s(now)},'carga',${s(now)},${s(now)} FROM people WHERE nombre=${s(r.nombre)};`
        : `INSERT OR IGNORE INTO visits (fecha, franja, orden, tipo, pharmacy_id, lugar, planeada, resultado, done_at, reporte_listo_at, reporte_via, created_at, updated_at)
  SELECT ${s(r.fecha)},'AM',99,'farmacia',id,nombre,0,'realizada',${s(now)},${s(now)},'carga',${s(now)},${s(now)} FROM pharmacies WHERE nombre=${s(r.nombre)} AND ciudad=${s(r.ciudad)};`
    );
  },
};

if (cmd === 'exportar') {
  const t = TABLAS[what];
  if (!t) throw new Error('Uso: npm run cargar -- exportar panel|farmacias');
  const out = JSON.parse(wrangler(['--json', '--command', t.exportar]));
  const res = out[0].results;
  const cols = Object.keys(res[0] || {});
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const file = t.file.replace('.csv', '.exportado.csv');
  writeFileSync(file, [cols.join(','), ...res.map((r) => cols.map((c) => q(r[c] ?? '')).join(','))].join('\n') + '\n');
  console.log(`${res.length} filas → ${file}`);
} else {
  const t = TABLAS[cmd];
  if (!t) throw new Error('Uso: npm run cargar -- panel|farmacias [--local]');
  const rows = parseCsv(readFileSync(t.file, 'utf8'));
  if (!rows.length) throw new Error(`${t.file} está vacío.`);
  const sqlFile = 'data/.carga.sql';
  writeFileSync(sqlFile, [...SCHEMA.map((x) => x + ';'), ...t.sql(rows)].join('\n'));
  wrangler(['--file', sqlFile]);
  console.log(`Listo: ${rows.length} filas de ${t.file} en ${db}${where[0] === '--local' ? ' (local)' : ''}.`);
  if (cmd === 'visitas') {
    const out = JSON.parse(wrangler(['--json', '--command', "SELECT COUNT(*) AS n FROM visits WHERE reporte_via='carga'"]));
    console.log(`Visitas de carga inicial en la base: ${out[0].results[0].n} (si es menor que ${rows.length}, algún nombre no coincide con el panel o las farmacias).`);
  }
}
