import 'server-only';
import ExcelJS from 'exceljs';
import { callSp, spRows } from '../db';
import { listAgreements, listBranches, listPriceLists } from '../services/clinic';
import { MAX_IMPORT_ROWS, type ImportEntitySpec } from '@/lib/shared/import-spec';

type Master = { code: string; name: string };

/** Columnas que se guardan como texto en la plantilla (no perder ceros a la izquierda). */
const TEXT_COLUMN = /documento|^hc$|_hc$|celular|telefono|codigo|^cop$|pieza|n_socio|ubigeo|tarifario|superficies|doctor|hora/;
const DATE_HINT = /fecha|vigencia/;

const BRAND = 'FF0E7490';
const REQUIRED_FILL = 'FFFDE68A';

/** Listas de valores aceptados (hoja «Valores») según la entidad, con los catálogos de la clínica. */
async function valueLists(tenantId: string, spec: ImportEntitySpec): Promise<{ title: string; rows: [string, string][] }[]> {
  const masters = async (table: string, title: string) => {
    const rows = await spRows<Master>('sp_master_item_list', [tenantId, table, 0]);
    return { title, rows: rows.map((m) => [m.code, m.name] as [string, string]) };
  };
  const lists: Promise<{ title: string; rows: [string, string][] }>[] = [];
  switch (spec.code) {
    case 'DOCTORS': lists.push(masters('SPECIALTY', 'Especialidades')); break;
    case 'SERVICES': lists.push(masters('SERVICE_CATEGORY', 'Categorías de servicio')); break;
    case 'PRICE_LIST_ITEMS':
      lists.push(listPriceLists(tenantId).then((r) => ({ title: 'Tarifarios existentes', rows: r.map((p) => [String(p.code), String(p.name)] as [string, string]) })));
      break;
    case 'PATIENTS':
      lists.push(masters('DOC_TYPE', 'Tipos de documento'), masters('SEX', 'Sexo'), masters('GUARDIAN_RELATIONSHIP', 'Parentescos'));
      lists.push(listAgreements(tenantId).then((r) => ({ title: 'Convenios', rows: r.map((a) => [String(a.code), String(a.name)] as [string, string]) })));
      lists.push(listPriceLists(tenantId).then((r) => ({ title: 'Tarifarios', rows: r.map((p) => [String(p.code), String(p.name)] as [string, string]) })));
      break;
    case 'APPOINTMENTS':
      lists.push(masters('APPOINTMENT_STATUS', 'Estados de cita'));
      lists.push(listBranches(tenantId).then((r) => ({ title: 'Sedes', rows: r.map((b) => [String(b.code), String(b.name)] as [string, string]) })));
      break;
    case 'BUDGETS':
      lists.push(masters('BUDGET_STATUS', 'Estados de presupuesto'));
      lists.push(listPriceLists(tenantId).then((r) => ({ title: 'Tarifarios', rows: r.map((p) => [String(p.code), String(p.name)] as [string, string]) })));
      break;
    default: break;
  }
  if (['CLINICAL_NOTES', 'APPOINTMENTS', 'BUDGETS'].includes(spec.code)) {
    lists.push(callSp('sp_import_context', [tenantId, 'DOCTORS']).then(([, r]) => ({
      title: 'Doctores (código / COP — nombre)',
      rows: r.map((d) => [String(d.code ?? d.license_number ?? ''), `${d.first_name} ${d.last_name}`] as [string, string]),
    })));
  }
  return Promise.all(lists);
}

function dataSheet(wb: ExcelJS.Workbook, name: string, spec: ImportEntitySpec, examples: Record<string, string>[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = spec.columns.map((c) => ({
    header: c.key, key: c.key, width: Math.min(Math.max(c.key.length + 4, DATE_HINT.test(c.key) ? 14 : 12, ...examples.map((e) => (e[c.key] ?? '').length + 2)), 60),
    style: TEXT_COLUMN.test(c.key) || DATE_HINT.test(c.key) ? { numFmt: '@' } : {},
  }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  spec.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required === true ? 'FFB45309' : BRAND } };
    cell.note = `${c.required === true ? 'OBLIGATORIA. ' : c.required === 'cond' ? 'Obligatoria según el caso. ' : ''}${c.description}${c.format ? `\nFormato: ${c.format}` : ''}`;
  });
  for (const e of examples) ws.addRow(spec.columns.map((c) => e[c.key] ?? ''));
  return ws;
}

/** Plantilla .xlsx: hojas «Datos» (para llenar), «Ejemplo», «Instrucciones» y «Valores». */
export async function buildTemplateXlsx(tenantId: string, spec: ImportEntitySpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OdontoSis';
  wb.created = new Date();

  dataSheet(wb, 'Datos', spec, []);
  dataSheet(wb, 'Ejemplo', spec, spec.examples);

  const ins = wb.addWorksheet('Instrucciones');
  ins.columns = [{ width: 28 }, { width: 16 }, { width: 70 }, { width: 40 }];
  const title = ins.addRow([`Paso ${spec.step} de 8 — ${spec.title}`]);
  title.font = { bold: true, size: 14 };
  ins.addRow([spec.summary]);
  if (spec.dependsOn) ins.addRow([`Antes carga: ${spec.dependsOn}.`]);
  ins.addRow([`Al volver a subir el archivo, los registros se reconocen por: ${spec.matchBy}. No se duplican.`]);
  ins.addRow([]);
  const rules = [
    'Cómo llenar:',
    '• Llena la hoja «Datos» (una fila por registro). No cambies ni borres la fila de encabezados. La hoja «Ejemplo» es sólo referencia.',
    '• Las columnas en color ámbar son obligatorias. Las demás puedes dejarlas vacías.',
    '• Fechas en formato DD/MM/AAAA (p. ej. 21/07/1988). Horas en formato 24 h HH:MM (p. ej. 15:30).',
    '• Números con punto decimal (p. ej. 150.50). SI / NO para las columnas de sí o no.',
    '• En registros que ya existen, las celdas vacías no borran los datos guardados (pacientes) o mantienen el valor anterior.',
    `• Máximo ${MAX_IMPORT_ROWS.toLocaleString('es-PE')} filas por archivo. También puedes subir un CSV en UTF-8 separado por ; o , con los mismos encabezados.`,
    '• Primero valida el archivo: verás las filas con error (fila, columna y motivo) antes de importar. Sólo se importan las filas válidas.',
  ];
  for (const r of rules) ins.addRow([r]).font = r.endsWith(':') ? { bold: true } : {};
  ins.addRow([]);
  const head = ins.addRow(['Columna', 'Obligatoria', 'Descripción', 'Formato / valores aceptados']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }; });
  for (const c of spec.columns) {
    const row = ins.addRow([c.key, c.required === true ? 'Sí' : c.required === 'cond' ? 'Según el caso' : 'No', c.description, c.format ?? '']);
    row.alignment = { wrapText: true, vertical: 'top' };
    if (c.required === true) row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_FILL } };
  }

  const lists = await valueLists(tenantId, spec);
  if (lists.length) {
    const val = wb.addWorksheet('Valores');
    val.columns = [{ width: 22 }, { width: 50 }];
    for (const l of lists) {
      val.addRow([l.title]).font = { bold: true };
      val.addRow(['Código', 'Nombre']).font = { italic: true };
      for (const r of l.rows.slice(0, 500)) val.addRow(r);
      val.addRow([]);
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Plantilla CSV (UTF-8 con BOM, separador ;) con encabezados y filas de ejemplo. */
export function buildTemplateCsv(spec: ImportEntitySpec): Buffer {
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [spec.columns.map((c) => c.key).join(';'), ...spec.examples.map((e) => spec.columns.map((c) => esc(e[c.key] ?? '')).join(';'))];
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}
