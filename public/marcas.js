// Mensajes de marca del reporte (los entrega la usuaria; los actualiza el administrador).
// Marcas, medicamentos y laboratorio son ficticios (versión de portafolio).
// Para cambiar un mensaje: edita el texto entre comillas y haz commit. No cambies los "id"
// (quedan guardados en las visitas para sugerir la marca de la próxima vez).
// Lo usan la app (para armar el texto) y la API (para validar). Sin dependencias.

export const MARCAS = [
  {
    id: 'oralix-novaclot',
    nombre: 'ORALIX + NOVACLOT',
    comentario:
      'Mensaje de respaldo Nexalia, recordatorio del portafolio integral, énfasis en la dupla ORALIX + NOVACLOT en el escenario clínico oncológico: tratamiento y protección antitrombótica basada en evidencia, resaltando que NOVACLOT viene en jeringa prellenada con escala volumétrica que brinda precisión y seguridad.',
    objetivo:
      'Realizar recordatorio diferencial de ORALIX, mejor absorción, comodidad y adherencia terapéutica. Seguimiento al uso del medicamento y diferencial de NOVACLOT en seguridad y confianza.',
  },
  {
    id: 'novaclot',
    nombre: 'NOVACLOT',
    comentario:
      'NOVACLOT en diferentes escenarios clínicos como actor principal, con su diferencial de jeringa prellenada con graduación volumétrica que brinda precisión, seguridad y comodidad.',
    objetivo: 'Realizar un recordatorio diferencial de NOVACLOT respaldado con evidencia científica sobre su perfil de seguridad.',
  },
  {
    id: 'novaclot-septivan',
    nombre: 'NOVACLOT - SEPTIVAN',
    comentario:
      'Mensaje de respaldo Nexalia, recordatorio del portafolio integral, énfasis en la dupla NOVACLOT - SEPTIVAN en el escenario de cuidado crítico, para pacientes con infección severa y riesgo tromboembólico',
    objetivo: 'realizar recordatorio diferencial de SEPTIVAN y su equivalencia terapéutica.',
  },
  {
    id: 'novaclot-anestril',
    nombre: 'NOVACLOT - ANESTRIL',
    comentario:
      'Mensaje de respaldo Nexalia, recordatorio de la dupla NOVACLOT - ANESTRIL en el escenario quirúrgico, favoreciendo una recuperación posquirúrgica segura y oportuna.',
    objetivo: 'realizar recordatorio diferencial de ANESTRIL: protección, alivio y una recuperación rápida.',
  },
];
export const SIN_MARCA = 'ninguna'; // visita sin producto: solo va el texto de la usuaria

// Farmacias: MEDICAMENTO se reemplaza por los que la usuaria marque ("NOVACLOT y SEPTIVAN").
export const MEDICAMENTOS = ['ORALIX', 'NOVACLOT', 'SEPTIVAN', 'ANESTRIL'];
export const FARMACIA_COMENTARIO = 'Actualmente con inventario de MEDICAMENTO, para atención de pacientes de EPS Andina, EPS Vida y EPS Bienestar.';
export const FARMACIA_OBJETIVO = 'Realizar seguimiento a convenios y rotación';

export const NO_EFECTIVA = 'Visita no efectiva';

// La tablet no muestra un límite; usamos este. Al pasarlo, el contador se pone amarillo (no bloquea).
export const LIMITE = 1000;

// ---------- armar los textos ----------
export const marcaPorId = (id) => MARCAS.find((m) => m.id === id) || null;

// "A" · "A y B" · "A, B y C"
export function enumerar(xs) {
  if (xs.length < 2) return xs.join('');
  return xs.slice(0, -1).join(', ') + ' y ' + xs[xs.length - 1];
}

// Une el texto fijo con el de la usuaria. Si el fijo no termina en puntuación, se agrega un punto entre los dos.
export function unir(fijo, nota) {
  const a = String(fijo || '').trim();
  const b = String(nota || '').trim();
  if (!a) return b;
  if (!b) return a;
  return (/[.!?:;]$/.test(a) ? a : a + '.') + ' ' + b;
}

// Partes fijas de cada campo según el tipo de visita y lo elegido.
// v: { tipo: 'persona'|'farmacia', resultado: 'realizada'|'no_efectiva'|null, marca, medicamentos: [] }
export function fijos(v) {
  if (v.resultado === 'no_efectiva') return { comentario: NO_EFECTIVA, objetivo: '' };
  if (v.tipo === 'farmacia') {
    const meds = MEDICAMENTOS.filter((m) => (v.medicamentos || []).includes(m));
    return { comentario: meds.length ? FARMACIA_COMENTARIO.replace('MEDICAMENTO', enumerar(meds)) : '', objetivo: FARMACIA_OBJETIVO };
  }
  const m = marcaPorId(v.marca);
  return { comentario: m ? m.comentario : '', objetivo: m ? m.objetivo : '' };
}

// Texto final: fijo + lo de la usuaria (ya ajustado).
export function armar(v, notaComentario, notaObjetivo) {
  const f = fijos(v);
  return { comentario: unir(f.comentario, notaComentario), objetivo: unir(f.objetivo, notaObjetivo) };
}
