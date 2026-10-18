/** Fechas de BD (UTC, 'YYYY-MM-DD HH:mm:ss.SSS') -> Date */
export function parseDbDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  return new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z');
}

/** Date -> formato DATETIME(3) UTC para enviar a un SP */
export const toDbDateTime = (d: Date | string) => new Date(d).toISOString().slice(0, 23).replace('T', ' ');

export function formatMoney(amount: number | null | undefined, symbol = 'S/') {
  const n = Number(amount ?? 0);
  return `${symbol} ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(v: string | Date | null | undefined, tz = 'America/Lima') {
  if (!v) return '—';
  // Fechas puras (YYYY-MM-DD) no se convierten de zona horaria
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = typeof v === 'string' ? parseDbDate(v)! : v;
  return d.toLocaleDateString('es-PE', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(v: string | Date | null | undefined, tz = 'America/Lima') {
  if (!v) return '—';
  const d = typeof v === 'string' ? parseDbDate(v)! : v;
  return d.toLocaleString('es-PE', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatTime(v: string | Date, tz = 'America/Lima') {
  const d = typeof v === 'string' ? parseDbDate(v)! : v;
  return d.toLocaleTimeString('es-PE', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Fecha local de hoy (YYYY-MM-DD) en la zona horaria indicada */
export function todayIn(tz = 'America/Lima') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function ageFrom(birth: string | null | undefined) {
  if (!birth) return null;
  const b = new Date(birth + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

/** Máscara para datos sensibles en listados (ej. 12345678 -> ••••5678) */
export const mask = (v: string | null | undefined, visible = 4) => (v ? `${'•'.repeat(Math.max(0, v.length - visible))}${v.slice(-visible)}` : '—');

/** Partes de fecha/hora de un instante en la zona horaria dada */
export function zonedParts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

/** Hora "de pared" en la zona horaria -> instante UTC */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const p = zonedParts(guess, tz);
  const asUtc = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), p.hour, p.minute);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

/** Suma días a una fecha YYYY-MM-DD */
export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana de la fecha */
export function weekStart(date: string) {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}
