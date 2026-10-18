import 'server-only';
import type { ZodError } from 'zod';
import type { ImportIssue } from '@/lib/shared/import-spec';
import type { Cell, ParsedRow } from './parse';

/** Normaliza para comparar nombres de catálogos: sin tildes, mayúsculas, espacios simples. */
export const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

const pad = (n: number) => String(n).padStart(2, '0');
const isValidDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2100 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Lector de una fila: convierte y valida cada columna acumulando errores con fila + columna. */
export class RowReader {
  readonly issues: ImportIssue[] = [];
  readonly warnings: ImportIssue[] = [];
  constructor(public readonly src: ParsedRow) {}

  get row() { return this.src.row; }
  get ok() { return this.issues.length === 0; }
  error(column: string | null, message: string) { this.issues.push({ row: this.row, column, message }); return null; }
  warn(column: string | null, message: string) { this.warnings.push({ row: this.row, column, message }); }

  raw(key: string): Cell { return this.src.values[key] ?? null; }
  has(key: string) { const v = this.raw(key); return v !== null && String(v).trim() !== ''; }

  str(key: string, o: { max?: number; required?: boolean } = {}): string | null {
    const v = this.raw(key);
    let s: string | null;
    if (v === null) s = null;
    else if (v instanceof Date) s = `${pad(v.getUTCDate())}/${pad(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
    else if (typeof v === 'number') s = Number.isInteger(v) ? v.toFixed(0) : String(v);
    else s = String(v).trim();
    if (!s) {
      if (o.required) this.error(key, 'Obligatorio');
      return null;
    }
    if (o.max && s.length > o.max) return this.error(key, `Máximo ${o.max} caracteres`);
    return s;
  }

  /** Fecha -> YYYY-MM-DD. Acepta DD/MM/AAAA, D/M/AAAA, DD-MM-AAAA, AAAA-MM-DD y celdas de fecha de Excel. */
  date(key: string, o: { required?: boolean } = {}): string | null {
    const v = this.raw(key);
    if (v === null || v === '') {
      if (o.required) this.error(key, 'Obligatorio');
      return null;
    }
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) return this.error(key, 'Fecha inválida (usa DD/MM/AAAA)');
      return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    }
    if (typeof v === 'number' && v > 1 && v < 80_000) {
      // Número de serie de Excel (días desde 1899-12-30)
      const d = new Date(Math.round((v - 25_569) * 86_400_000));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m && isValidDate(+m[3], +m[2], +m[1])) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
    if (m && isValidDate(+m[1], +m[2], +m[3])) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    return this.error(key, 'Fecha inválida (usa DD/MM/AAAA)');
  }

  /** Hora -> HH:MM. Acepta 9:30, 09:30, 09:30:00, 3:30 pm y celdas de hora de Excel. */
  time(key: string, o: { required?: boolean } = {}): string | null {
    const v = this.raw(key);
    if (v === null || v === '') {
      if (o.required) this.error(key, 'Obligatorio');
      return null;
    }
    if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    if (typeof v === 'number' && v >= 0 && v < 1) {
      const mins = Math.round(v * 1440);
      return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
    }
    const m = String(v).trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
    if (m) {
      let h = +m[1]; const min = +m[2];
      if (m[3] === 'pm' && h < 12) h += 12;
      if (m[3] === 'am' && h === 12) h = 0;
      if (h < 24 && min < 60) return `${pad(h)}:${pad(min)}`;
    }
    return this.error(key, 'Hora inválida (usa HH:MM, p. ej. 15:30)');
  }

  /** Número. Acepta 1500, 1500.50, 1500,50, 1,500.50, "S/ 150". */
  num(key: string, o: { required?: boolean; min?: number; max?: number; int?: boolean } = {}): number | null {
    const v = this.raw(key);
    if (v === null || v === '') {
      if (o.required) this.error(key, 'Obligatorio');
      return null;
    }
    let n: number;
    if (typeof v === 'number') n = v;
    else {
      let s = String(v).trim().replace(/^(S\/|US\$|\$)\s*/i, '').replace(/\s|%/g, '');
      if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
      else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
      n = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
    }
    if (!Number.isFinite(n)) return this.error(key, 'Debe ser un número');
    if (o.int && !Number.isInteger(n)) return this.error(key, 'Debe ser un número entero');
    if (o.min !== undefined && n < o.min) return this.error(key, `Mínimo ${o.min}`);
    if (o.max !== undefined && n > o.max) return this.error(key, `Máximo ${o.max}`);
    return Math.round(n * 100) / 100;
  }

  /** SI / NO (también S/N, 1/0, X, VERDADERO/FALSO). Vacío = valor por defecto. */
  bool(key: string, def: boolean): boolean {
    const v = this.raw(key);
    if (v === null || v === '') return def;
    if (typeof v === 'boolean') return v;
    const s = norm(String(v));
    if (['SI', 'S', 'YES', 'Y', '1', 'X', 'TRUE', 'VERDADERO'].includes(s)) return true;
    if (['NO', 'N', '0', 'FALSE', 'FALSO'].includes(s)) return false;
    this.error(key, 'Usa SI o NO');
    return def;
  }

  /** Copia los errores de un esquema zod indicando la columna de la planilla. */
  zod(err: ZodError, columnOf: Record<string, string>) {
    for (const i of err.issues) {
      const path = i.path.join('.');
      this.error(columnOf[path] ?? null, i.message);
    }
  }
}

/** Tooth FDI: "16" -> "1.6"; "1.6" se mantiene. */
export function toothFdi(v: string | null): string | null | false {
  if (!v) return null;
  const s = v.replace(/\s/g, '');
  const m = s.match(/^([1-8])\.?([1-8])$/);
  return m ? `${m[1]}.${m[2]}` : false;
}
