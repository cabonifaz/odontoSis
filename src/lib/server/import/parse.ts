import 'server-only';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { Inflate, strToU8, zipSync } from 'fflate';
import { AppError } from '../errors';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from '@/lib/shared/import-spec';

/** Valor de una celda: texto, número, fecha (celdas de fecha de Excel), booleano o vacío. */
export type Cell = string | number | boolean | Date | null;
export type ParsedRow = { row: number; values: Record<string, Cell> };
/** headers: todos los encabezados (normalizados); rows: sólo las columnas conocidas de la plantilla. */
export type ParsedFile = { format: 'xlsx' | 'csv'; headers: string[]; rows: ParsedRow[] };
export type ParseOptions = { known: string[] };

// Límites de descompresión (bytes REALES producidos, no los declarados en el ZIP)
const MAX_UNZIPPED_TOTAL = 80 * 1024 * 1024;
const MAX_UNZIPPED_ENTRY = 60 * 1024 * 1024;
/** Por encima de 10 MB descomprimidos, una tasa mayor a 200:1 se considera una bomba de compresión */
const RATIO_CHECK_FROM = 10 * 1024 * 1024;
const MAX_RATIO = 200;
const INFLATE_SLICE = 8 * 1024; // como máximo ~8 MB de salida por cada trozo comprimido
const MAX_ZIP_ENTRIES = 2000;
/** Sólo las partes del xlsx que se leen; todo lo demás (macros, imágenes, objetos incrustados…) se descarta */
const KEEP = /^(\[Content_Types\]\.xml|_rels\/\.rels|xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/styles\.xml|xl\/worksheets\/sheet\d{1,3}\.xml)$/;

const invalid = () => new AppError('IMPORT_INVALID_FILE');

/** Columnas máximas aceptadas: el doble de las de la plantilla (mín. 20) y nunca más de 100. */
export const maxColumns = (specColumns: number) => Math.min(100, Math.max(20, specColumns * 2));

/** Normaliza un encabezado: minúsculas, sin tildes, espacios/guiones -> "_", sin "*" ni paréntesis. */
export const normHeader = (h: string) =>
  h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*()°º.]/g, '').trim().replace(/[\s-]+/g, '_').slice(0, 80);

/**
 * Lee el archivo subido. Se valida el tipo por "magic bytes" (no por extensión):
 *  - XLSX: ZIP (PK\x03\x04). Se descomprime aquí con tope de bytes reales y se reconstruye un ZIP limpio
 *    con sólo las partes necesarias, que se lee en streaming (se detiene al superar el máximo de filas).
 *  - CSV: texto UTF-8 válido (con o sin BOM), separador ; , o tabulador.
 */
export async function parseImportFile(buf: Buffer, opts: ParseOptions): Promise<ParsedFile> {
  if (buf.length === 0) throw new AppError('IMPORT_EMPTY');
  if (buf.length > MAX_IMPORT_BYTES) throw invalid();
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const limit = maxColumns(opts.known.length);
  const parsed = isZip ? await parseXlsx(buf, opts, limit) : parseCsv(buf, opts, limit);
  if (parsed.rows.length === 0) throw new AppError('IMPORT_EMPTY');
  if (parsed.rows.length > MAX_IMPORT_ROWS) throw new AppError('IMPORT_TOO_MANY_ROWS');
  return parsed;
}

// ---------------- ZIP seguro ----------------
type Entry = { name: string; method: number; flags: number; compressed: number; localOffset: number };

function centralDirectory(buf: Buffer): Entry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw invalid();
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ZIP_ENTRIES || cdOffset >= buf.length) throw invalid();
  const entries: Entry[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw invalid();
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (compressed === 0xffffffff || localOffset === 0xffffffff) throw invalid(); // ZIP64: no se acepta
    entries.push({ name: buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'), method, flags, compressed, localOffset });
    p += 46 + nameLen + extra + comment;
  }
  return entries;
}

/** Descomprime sólo las partes necesarias contando los bytes realmente producidos. */
function safeUnzip(buf: Buffer): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  let total = 0;
  for (const e of centralDirectory(buf)) {
    if (!KEEP.test(e.name) || out.has(e.name)) continue;
    if (e.flags & 0x1) throw invalid(); // cifrado
    const lh = e.localOffset;
    if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) throw invalid();
    const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
    const end = start + e.compressed;
    if (end > buf.length) throw invalid();
    const data = buf.subarray(start, end);
    let produced = 0;
    const chunks: Uint8Array[] = [];
    const count = (n: number) => {
      produced += n;
      if (produced > MAX_UNZIPPED_ENTRY || total + produced > MAX_UNZIPPED_TOTAL) throw invalid();
      if (produced > RATIO_CHECK_FROM && produced / Math.max(1, e.compressed) > MAX_RATIO) throw invalid();
    };
    if (e.method === 0) {
      count(data.length);
      chunks.push(data);
    } else if (e.method === 8) {
      const inf = new Inflate((chunk) => { count(chunk.length); chunks.push(chunk); });
      try {
        for (let i = 0; i < data.length; i += INFLATE_SLICE) inf.push(data.subarray(i, i + INFLATE_SLICE), i + INFLATE_SLICE >= data.length);
        if (data.length === 0) inf.push(new Uint8Array(0), true);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw invalid(); // flujo deflate corrupto
      }
    } else throw invalid();
    total += produced;
    const merged = new Uint8Array(produced);
    let o = 0;
    for (const c of chunks) { merged.set(c, o); o += c.length; }
    out.set(e.name, merged);
  }
  if (!out.has('xl/workbook.xml') || ![...out.keys()].some((k) => k.startsWith('xl/worksheets/'))) throw invalid();
  return out;
}

/** ZIP nuevo, sin compresión, con las partes en el orden que espera el lector en streaming. */
function cleanXlsx(parts: Map<string, Uint8Array>): Uint8Array {
  const order = ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/workbook.xml', 'xl/sharedStrings.xml', 'xl/styles.xml'];
  const files: Record<string, Uint8Array> = {};
  for (const k of order) {
    const v = parts.get(k);
    if (v) files[k] = v;
    // Sin sharedStrings el lector guardaría las hojas en archivos temporales
    else if (k === 'xl/sharedStrings.xml') {
      files[k] = strToU8('<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>');
    }
  }
  for (const [k, v] of parts) if (k.startsWith('xl/worksheets/')) files[k] = v;
  return zipSync(files, { level: 0 });
}

// ---------------- XLSX ----------------
function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('') || null;
    if ('result' in v) return cellValue((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ('text' in v) return cellValue((v as { text: ExcelJS.CellValue }).text);
    if ('error' in v) return null;
  }
  return String(v);
}

type StreamReader = AsyncIterable<{ name: string } & AsyncIterable<{ number: number; values: ExcelJS.CellValue[] | Record<string, ExcelJS.CellValue> }>> & {
  model?: { sheets?: { id: number; name: string; rId: string }[] };
};

async function parseXlsx(buf: Buffer, opts: ParseOptions, limit: number): Promise<ParsedFile> {
  const zip = cleanXlsx(safeUnzip(buf));
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from([Buffer.from(zip)]), {
    worksheets: 'emit', sharedStrings: 'cache', styles: 'cache', hyperlinks: 'ignore', entries: 'ignore',
  }) as unknown as StreamReader;

  const skip = new Set(['instrucciones', 'ejemplo', 'valores']);
  const known = new Set(opts.known);
  let headers: string[] = [];
  let columns: [number, string][] = [];
  const rows: ParsedRow[] = [];
  let target: string | null = null;
  try {
    for await (const ws of reader) {
      if (target === null) {
        const names = (reader.model?.sheets ?? []).map((s) => s.name);
        target = names.find((n) => normHeader(n) === 'datos') ?? names.find((n) => !skip.has(normHeader(n))) ?? ws.name;
      }
      if (ws.name !== target) continue;
      for await (const row of ws) {
        const values = row.values as ExcelJS.CellValue[];
        if (row.number === 1) {
          const named: [number, string][] = [];
          for (let i = 1; i < values.length; i++) {
            const v = cellValue(values[i]);
            if (v === null) continue;
            named.push([i, normHeader(String(v))]);
            if (named.length > limit) throw new AppError('IMPORT_TOO_MANY_COLUMNS');
          }
          headers = named.map(([, h]) => h);
          columns = named.filter(([, h]) => known.has(h));
          continue;
        }
        const out: Record<string, Cell> = {};
        let any = false;
        for (const [idx, key] of columns) {
          const v = cellValue(values[idx]);
          out[key] = v;
          if (v !== null) any = true;
        }
        if (any) rows.push({ row: row.number, values: out });
        if (rows.length > MAX_IMPORT_ROWS) break; // se rechaza arriba; no se sigue leyendo
      }
      break;
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw invalid();
  }
  return { format: 'xlsx', headers, rows };
}

// ---------------- CSV ----------------
function parseCsv(buf: Buffer, opts: ParseOptions, limit: number): ParsedFile {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    throw invalid();
  }
  if (text.includes('\u0000')) throw invalid();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  if (count(delim) + 1 > limit) throw new AppError('IMPORT_TOO_MANY_COLUMNS');

  // RFC 4180: comillas dobles, "" escapadas, saltos de línea dentro de comillas.
  // Las celdas más allá del límite de columnas se descartan sin guardarlas.
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = []; let field = ''; let quoted = false; let line = 1; let startLine = 1;
  const pushCell = () => { if (cells.length < limit) cells.push(field); field = ''; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') { quoted = true; continue; }
    if (c === delim) { pushCell(); continue; }
    if (c === '\r') continue;
    if (c === '\n') {
      pushCell(); records.push({ line: startLine, cells }); cells = []; line++; startLine = line;
      if (records.length > MAX_IMPORT_ROWS + 1) break;
      continue;
    }
    field += c;
  }
  if (field !== '' || cells.length) { pushCell(); records.push({ line: startLine, cells }); }
  if (records.length === 0) throw new AppError('IMPORT_EMPTY');

  const headers = records[0].cells.map((h) => normHeader(h));
  const known = new Set(opts.known);
  const columns = headers.map((h, i) => [i, h] as const).filter(([, h]) => known.has(h));
  const rows: ParsedRow[] = [];
  for (const r of records.slice(1)) {
    const values: Record<string, Cell> = {};
    let any = false;
    for (const [idx, key] of columns) {
      const v = (r.cells[idx] ?? '').trim();
      values[key] = v === '' ? null : v;
      if (v !== '') any = true;
    }
    if (any) rows.push({ row: r.line, values });
  }
  return { format: 'csv', headers: headers.filter(Boolean), rows };
}
