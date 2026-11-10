// Valores fijos de la hoja de legalización del fondo y reglas del negocio.
// Si algo cambia (por ejemplo, el cupo mensual el próximo año), se cambia aquí.
export const CONFIG = {
  saldoInicialDefault: 500000,
  motivoDefault: 'Relacionamiento profesional: SOCIALIZACIÓN DE CONCEPTOS MÉDICOS',
  ceco: 'C00D000000 DEMO',
  cuenta: '5200000000',
  empresa: 'Laboratorios Nexalia',
  funcionariosEmpresa: 'U.Demo',
  alertaPct: 80, // aviso amarillo desde este % del saldo inicial gastado
};

export const SESSION_DAYS = 7;
export const MAX_FAILS = 8; // intentos fallidos de PIN por IP...
export const FAIL_WINDOW_MIN = 15; // ...en esta ventana de minutos
// Límite global (todas las IP juntas): frena a quien rote IPs para probar las 10.000 combinaciones.
// Con 50 intentos al día, recorrer la mitad de los PIN tomaría más de 3 meses.
// Si se activa, la usuaria sigue entrando con su sesión abierta (dura 7 días); solo se bloquea el ingreso con PIN.
export const GLOBAL_MAX_FAILS_HOUR = 20;
export const GLOBAL_MAX_FAILS_DAY = 50;
export const PURGE_DAYS = 60; // los soportes se borran 2 meses después del cierre
export const MAX_FILE_MB = 15;
