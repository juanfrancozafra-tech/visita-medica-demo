// Lectura de facturas con la API de Claude (visión). El navegador manda el archivo ya en base64,
// así el servidor solo arma la petición y no gasta tiempo de CPU convirtiendo.
import { fechaFactura, hoyBogota } from './fechas.js';

const PROMPT = `Eres un asistente que lee facturas y recibos de compra colombianos (cafés, restaurantes, etc.).
Extrae los datos y llama a la herramienta registrar_factura. Reglas:
- proveedor: razón social del vendedor en MAYÚSCULAS, como aparece en la factura (ej. "ESTRELLA ANDINA SAS"). Si el nombre comercial es distinto y aparece, agrégalo después de " - " (ej. "ESTRELLA ANDINA SAS - STARBUCKS").
- nit: NIT del vendedor, solo números, SIN el dígito de verificación (ej. "900.632.938-1" -> "900632938").
- factura: número de la factura electrónica con su prefijo, sin espacios (ej. "FEPS3414", "STJP327269"). Si solo hay número de recibo o tiquete, usa ese.
- fecha_impresa: la fecha de la compra copiada TAL CUAL aparece impresa (ej. "03/11/2026", "2026-11-03 14:22", "3 NOV 2026").
- fecha: esa misma fecha en formato AAAA-MM-DD. En Colombia las fechas se escriben DÍA/MES/AÑO: "03/11/2026" es el 3 de noviembre de 2026 (2026-11-03), NO el 11 de marzo. La compra es reciente: hoy es {HOY}.
- valor: valor TOTAL pagado en pesos colombianos, como número entero sin puntos ni signos (ej. "$37.400" -> 37400). Si la propina está incluida en el total pagado, inclúyela.
- Si un dato no se puede leer con seguridad, déjalo vacío ("" o 0) en lugar de inventarlo, y explícalo en notas.`;

const TOOL = {
  name: 'registrar_factura',
  description: 'Registra los datos extraídos de una factura o recibo.',
  input_schema: {
    type: 'object',
    properties: {
      proveedor: { type: 'string' },
      nit: { type: 'string' },
      factura: { type: 'string' },
      fecha_impresa: { type: 'string', description: 'Fecha tal cual está impresa en la factura' },
      fecha: { type: 'string', description: 'AAAA-MM-DD (en la factura viene día/mes/año)' },
      valor: { type: 'integer', description: 'Total en COP, sin decimales' },
      notas: { type: 'string', description: 'Dudas o datos que no se pudieron leer. Vacío si todo está claro.' },
    },
    required: ['proveedor', 'nit', 'factura', 'fecha_impresa', 'fecha', 'valor', 'notas'],
  },
};

const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

export async function extractInvoice(env, mediaType, base64) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'Falta configurar la llave de la API de Claude (ANTHROPIC_API_KEY).');
  if (!MEDIA.has(mediaType)) throw new HttpError(400, 'Formato no soportado. Usa una foto (JPG/PNG) o un PDF.');
  if (!base64 || base64.indexOf('"') !== -1 || base64.indexOf('\\') !== -1) throw new HttpError(400, 'Archivo inválido.');

  const hoy = hoyBogota();
  const source = `{"type":"base64","media_type":"${mediaType}","data":"${base64}"}`;
  const block = mediaType === 'application/pdf' ? `{"type":"document","source":${source}}` : `{"type":"image","source":${source}}`;
  const body =
    `{"model":${JSON.stringify(env.CLAUDE_MODEL || 'claude-haiku-5-5')},"max_tokens":1024,` +
    `"tools":[${JSON.stringify(TOOL)}],"tool_choice":{"type":"tool","name":"registrar_factura"},` +
    `"messages":[{"role":"user","content":[${block},{"type":"text","text":${JSON.stringify(PROMPT.replace('{HOY}', hoy))}}]}]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    console.log('Claude API error', res.status, txt.slice(0, 500));
    throw new HttpError(502, 'No se pudo leer la factura en este momento. Puedes llenar los datos a mano.');
  }
  const data = await res.json();
  const tool = (data.content || []).find((c) => c.type === 'tool_use');
  if (!tool) throw new HttpError(502, 'No se pudo leer la factura. Puedes llenar los datos a mano.');
  const f = tool.input || {};
  const fe = fechaFactura(f.fecha, f.fecha_impresa, hoy);
  return {
    proveedor: String(f.proveedor || '').trim(),
    nit: String(f.nit || '').replace(/\D/g, ''),
    factura: String(f.factura || '').replace(/\s+/g, ''),
    fecha: fe.fecha,
    valor: Number.isFinite(Number(f.valor)) ? Math.round(Number(f.valor)) : 0,
    notas: [fe.nota, String(f.notas || '').trim()].filter(Boolean).join(' '),
    fecha_revisar: Boolean(fe.nota),
  };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
