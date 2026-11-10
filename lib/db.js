// Esquema de D1. Se crea solo en la primera petición (no hace falta correr migraciones a mano).
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    saldo_inicial INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierto',
    created_at TEXT NOT NULL,
    closed_at TEXT,
    files_purged_at TEXT
  )`,
  // Solo puede haber un período abierto a la vez.
  `CREATE UNIQUE INDEX IF NOT EXISTS one_open_period ON periods(estado) WHERE estado = 'abierto'`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES periods(id),
    proveedor TEXT NOT NULL,
    nit TEXT NOT NULL,
    factura TEXT NOT NULL,
    factura_norm TEXT NOT NULL,
    fecha TEXT NOT NULL,
    motivo TEXT NOT NULL,
    valor INTEGER NOT NULL,
    funcionario TEXT NOT NULL,
    file_key TEXT,
    file_type TEXT,
    file_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  // Antes el número de factura era único en toda la base; ahora el duplicado es NIT + número (se valida en la API).
  `DROP INDEX IF EXISTS unique_factura`,
  `CREATE INDEX IF NOT EXISTS expenses_factura ON expenses(factura_norm)`,
  `CREATE INDEX IF NOT EXISTS expenses_period ON expenses(period_id, fecha)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS login_fails (ip TEXT NOT NULL, at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS login_fails_at ON login_fails(at)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,

  // ----- Visitas médicas -----
  // Panel, farmacias y marcas los carga el administrador desde CSV (scripts/). "activo" en vez de borrar, para no perder el historial.
  `CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    esp TEXT NOT NULL,
    institucion TEXT NOT NULL,
    ciudad TEXT NOT NULL,
    frecuencia INTEGER NOT NULL DEFAULT 1,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pharmacies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    ciudad TEXT NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    UNIQUE (nombre, ciudad)
  )`,
  `CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    mensaje TEXT NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1
  )`,
  // Ciclos del laboratorio (20 días hábiles). No se cruzan: lo valida la API.
  `CREATE TABLE IF NOT EXISTS cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  // Una fila = una visita (planeada o no). El estado se calcula al leer: resultado + fecha + reporte_listo_at.
  // El ciclo de una visita es el que contiene su fecha (sin llave), así una semana puede quedar entre dos ciclos.
  `CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    franja TEXT NOT NULL CHECK (franja IN ('AM','PM')),
    orden INTEGER NOT NULL DEFAULT 0,
    tipo TEXT NOT NULL CHECK (tipo IN ('persona','farmacia')),
    person_id INTEGER REFERENCES people(id),
    pharmacy_id INTEGER REFERENCES pharmacies(id),
    lugar TEXT NOT NULL,
    planeada INTEGER NOT NULL DEFAULT 1,
    resultado TEXT CHECK (resultado IN ('realizada','no_efectiva')),
    notas TEXT,
    comentario TEXT,
    objetivo TEXT,
    done_at TEXT,
    reporte_listo_at TEXT,
    reporte_via TEXT CHECK (reporte_via IN ('copia','tablet','carga')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK ((tipo='persona' AND person_id IS NOT NULL AND pharmacy_id IS NULL) OR (tipo='farmacia' AND pharmacy_id IS NOT NULL AND person_id IS NULL))
  )`,
  // Nunca dos visitas a la misma persona (o farmacia) el mismo día.
  `CREATE UNIQUE INDEX IF NOT EXISTS visit_person_day ON visits(person_id, fecha) WHERE person_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS visit_pharmacy_day ON visits(pharmacy_id, fecha) WHERE pharmacy_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS visits_fecha ON visits(fecha, franja, orden)`,
  // Mensajes de marca usados en un reporte (copia del texto, para que no cambie si la marca se actualiza).
  `CREATE TABLE IF NOT EXISTS visit_brands (
    visit_id INTEGER NOT NULL REFERENCES visits(id),
    brand_id INTEGER NOT NULL REFERENCES brands(id),
    mensaje TEXT NOT NULL,
    PRIMARY KEY (visit_id, brand_id)
  )`,
];

// Columnas agregadas después de crear la tabla (SQLite no tiene ADD COLUMN IF NOT EXISTS).
// Fase 2 (reporte): marca elegida, medicamentos de farmacia (separados por coma) y la nota de la usuaria para el objetivo.
// La nota del comentario va en `notas`; los textos finales, en `comentario` y `objetivo`.
const MIGRACIONES = [
  ['visits', 'marca', 'TEXT'],
  ['visits', 'medicamentos', 'TEXT'],
  ['visits', 'nota_objetivo', 'TEXT'],
];

let ready = false;
export async function ensureSchema(db) {
  if (ready) return;
  await db.batch(SCHEMA.map((s) => db.prepare(s)));
  for (const tabla of new Set(MIGRACIONES.map((m) => m[0]))) {
    const { results } = await db.prepare(`PRAGMA table_info(${tabla})`).all();
    const hay = new Set(results.map((c) => c.name));
    for (const [t, col, tipo] of MIGRACIONES) if (t === tabla && !hay.has(col)) await db.prepare(`ALTER TABLE ${t} ADD COLUMN ${col} ${tipo}`).run();
  }
  ready = true;
}

export const now = () => new Date().toISOString();

// Número de factura normalizado para detectar duplicados: "fesf 23345" = "FESF23345".
export const normFactura = (s) => String(s || '').toUpperCase().replace(/[\s\-_.]/g, '');

// NIT comparable: solo dígitos y sin dígito de verificación cuando viene con guion ("901.000.101-1" = "901000101").
const baseNit = (s) => String(s || '').split('-')[0].replace(/\D/g, '');
// Mismo NIT aunque uno traiga el dígito de verificación pegado ("9010001011" vs "901000101").
export function mismoNit(a, b) {
  const x = baseNit(a), y = baseNit(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length < y.length ? [x, y] : [y, x];
  return largo.length === corto.length + 1 && largo.startsWith(corto);
}
