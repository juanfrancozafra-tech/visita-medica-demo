// Reporte de visitas: dictado (Whisper en Workers AI) y ajuste del texto de la usuaria (Claude).
// El mensaje de marca NO pasa por la IA: se usa tal cual (ver public/marcas.js). Solo se ajusta lo que ella dicta o escribe.
import { HttpError } from './extract.js';
import { MEDICAMENTOS } from '../public/marcas.js';
import { demoOn, demoAjustar, DEMO_DICTADO } from './demo.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const MAX_NOTA = 3000; // lo que se acepta para ajustar (el límite del reporte, 1.000, lo marca la app)
export const MAX_AUDIO_MB = 9; // ~3 minutos de WAV a 16 kHz, en base64

// Minúsculas, con mayúscula al inicio de cada oración y los medicamentos siempre en MAYÚSCULA.
export function normalizar(texto) {
  let t = String(texto || '').trim().toLowerCase();
  t = t.replace(/(^|[.!?]\s+)([a-záéíóúñü])/g, (_, a, b) => a + b.toUpperCase());
  for (const m of MEDICAMENTOS) t = t.replace(new RegExp(`\\b${m.toLowerCase()}\\b`, 'gi'), m);
  return t;
}

const PROMPT = (campo) => `Eres el asistente de una visitadora médica de un laboratorio farmacéutico en Colombia. Te paso lo que ella dictó o escribió para el campo "${
  campo === 'objetivo' ? 'objetivo de la próxima visita' : 'comentario de la visita'
}" de su reporte. Va pegado después de un mensaje de marca fijo, así que no lo repitas ni lo resumas.

Devuélvelo listo para pegar:
- Corrige ortografía, tildes y puntuación. Quita muletillas, repeticiones y palabras de relleno propias del dictado ("eh", "bueno", "o sea", "pues").
- Conserva el sentido y los datos. No agregues información, no inventes, no opines, no saludes ni expliques lo que hiciste.
- Redacción breve y profesional, en tercera persona cuando hable del médico o del personal ("el doctor comenta que…").
- En minúsculas, también nombres propios, cargos y siglas, salvo la primera letra de cada oración. Los nombres de medicamentos van en MAYÚSCULAS (por ejemplo ${MEDICAMENTOS.join(', ')}).
- Si el texto está vacío o no tiene contenido útil, responde con una cadena vacía.

Responde solo con el texto final, sin comillas.`;

export async function ajustar(env, texto, campo) {
  const t = String(texto || '').trim();
  if (!t) return '';
  if (t.length > MAX_NOTA) throw new HttpError(400, `El texto es muy largo (máximo ${MAX_NOTA} caracteres).`);
  if (demoOn(env)) return demoAjustar(t); // demo: limpieza local, sin llamar a Claude
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'Falta configurar la llave de la API de Claude (ANTHROPIC_API_KEY).');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || 'claude-haiku-5-5',
      max_tokens: 800,
      system: PROMPT(campo),
      messages: [{ role: 'user', content: t }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.log('Claude API error', res.status, txt.slice(0, 500));
    // El motivo va en el aviso para poder diagnosticar sin abrir los registros de Cloudflare (no incluye la llave).
    let motivo = '';
    try {
      const e = JSON.parse(txt).error || {};
      motivo = [e.type, e.message].filter(Boolean).join(': ').slice(0, 200);
    } catch {}
    throw new HttpError(502, `No se pudo ajustar el texto (Claude respondió ${res.status}${motivo ? ' · ' + motivo : ''}). Puedes usarlo tal cual o editarlo a mano.`);
  }
  const data = await res.json();
  const out = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim().replace(/^"|"$/g, '');
  return normalizar(out);
}

// Audio en base64 (WAV 16 kHz mono que arma el navegador) → texto.
export async function transcribir(env, base64) {
  if (demoOn(env)) return DEMO_DICTADO; // demo: nota de ejemplo, sin Whisper
  if (!env.AI) throw new HttpError(503, 'El dictado no está activado en este entorno (falta el binding AI de Workers AI).');
  if (!base64 || base64.length < 1000) throw new HttpError(400, 'No se recibió audio. Intenta grabar de nuevo.');
  if (base64.length > MAX_AUDIO_MB * 1024 * 1024) throw new HttpError(413, 'El audio es muy largo. Graba máximo 3 minutos.');
  let r;
  try {
    r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: base64,
      language: 'es',
      initial_prompt: `Visita médica. ${MEDICAMENTOS.join(', ')}.`,
      condition_on_previous_text: false,
      vad_filter: true,
    });
  } catch (e) {
    console.log('Whisper error', e && e.message);
    throw new HttpError(502, 'No se pudo convertir el audio a texto. Intenta de nuevo o escribe la nota.');
  }
  return String((r && (r.text ?? r.transcription_info?.text)) || '').trim();
}

// POST /api/compose { texto, campo: 'comentario'|'objetivo' } → { texto }
// POST /api/transcribe (cuerpo: audio en base64, texto plano) → { texto }
export async function redactarRoute(request, env, res) {
  if (request.method !== 'POST') return null;
  if (res === 'compose') {
    let b;
    try {
      b = await request.json();
    } catch {
      throw new HttpError(400, 'Datos inválidos.');
    }
    return json({ texto: await ajustar(env, b.texto, b.campo === 'objetivo' ? 'objetivo' : 'comentario') });
  }
  if (res === 'transcribe') return json({ texto: await transcribir(env, await request.text()) });
  return null;
}
