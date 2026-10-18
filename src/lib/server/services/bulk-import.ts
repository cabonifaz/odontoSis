import 'server-only';
import { randomUUID } from 'node:crypto';
import { callSp, spRows } from '../db';
import { AppError } from '../errors';
import { decrypt, sha256 } from '../crypto';
import { getTenant } from './platform';
import { loadContext } from '../import/context';
import { PROCESSORS, type Unit } from '../import/entities';
import { parseImportFile } from '../import/parse';
import { MAX_IMPORT_BYTES, specByCode, type ImportBatchRow, type ImportEntity, type ImportIssue, type ImportResult } from '@/lib/shared/import-spec';
import { tenantAccess, type TenantPhase } from '@/lib/shared/types';
import { todayIn } from '@/lib/shared/format';

/**
 * Carga masiva (sólo en el periodo de implementación).
 * El archivo se lee y valida aquí (zod + resolución de referencias con sp_import_context); las filas válidas
 * se guardan en bloques JSON con sp_import_<entidad>, que vuelven a verificar la fase y el aislamiento del tenant.
 */
export type ImportActor = { tenantId: string; userId: string; ip: string | null };

/** Fase de acceso actual de una clínica (para el super admin; el usuario de clínica la trae en su sesión). */
export async function tenantPhase(tenantId: string): Promise<TenantPhase | null> {
  const t = await getTenant(tenantId);
  if (!t) return null;
  const tz = String(t.timezone || 'America/Lima');
  const d = (v: unknown) => (v ? String(v).slice(0, 10) : null);
  let today: string;
  try { today = todayIn(tz); } catch { today = todayIn(); }
  return tenantAccess({
    status: String(t.status_code), subscriptionStart: d(t.subscription_start), subscriptionEnd: d(t.subscription_end),
    implementationStart: d(t.implementation_start), implementationEnd: d(t.implementation_end),
  }, today).phase;
}

export function assertImplementation(phase: TenantPhase | null | undefined) {
  if (phase !== 'IMPLEMENTATION') throw new AppError('IMPORT_NOT_AVAILABLE');
}

/** JSON sin claves nulas: en los SP una clave ausente se lee como NULL. */
const toJson = (v: unknown) => JSON.stringify(v, (_k, x) => (x === null ? undefined : x));

const MAX_STORED_ERRORS = 300;

/** canEditBudgets: el usuario puede modificar presupuestos ya guardados (budgets.edit); el super admin siempre. */
export type ImportOptions = { canEditBudgets: boolean };

export async function runImport(a: ImportActor, entity: ImportEntity, file: File, mode: 'validate' | 'import', opts: ImportOptions): Promise<ImportResult> {
  const t0 = Date.now();
  const spec = specByCode(entity)!;
  if (file.size === 0) throw new AppError('IMPORT_EMPTY');
  if (file.size > MAX_IMPORT_BYTES) throw new AppError('IMPORT_INVALID_FILE');
  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = await parseImportFile(buf, { known: spec.columns.map((c) => c.key) });

  // Columnas obligatorias presentes; columnas desconocidas se ignoran con advertencia
  const known = new Set(spec.columns.map((c) => c.key));
  const missing = spec.columns.filter((c) => c.required === true && !parsed.headers.includes(c.key)).map((c) => c.key);
  if (missing.length) {
    throw new AppError('VALIDATION', 400, `Faltan columnas obligatorias: ${missing.join(', ')}. Descarga la plantilla de ${spec.title} y no cambies la fila de encabezados.`);
  }
  const warnings: ImportIssue[] = parsed.headers.filter((h) => !known.has(h))
    .map((h) => ({ row: 1, column: h, message: 'Columna no reconocida: se ignora' }));

  const ctx = await loadContext(a.tenantId, entity);
  const proc = PROCESSORS[entity];
  const prep = proc.prepare(parsed, ctx, opts);
  warnings.push(...prep.warnings);
  const errors = [...prep.issues];

  const result = (extra: Partial<ImportResult> = {}): ImportResult => {
    const errorRows = new Set(errors.map((e) => e.row).filter((r): r is number => r !== null)).size;
    return {
      entity, mode, fileName: file.name, totalRows: parsed.rows.length, okRows: parsed.rows.length - errorRows, errorRows,
      createCount: prep.units.filter((u) => u.isNew).length, updateCount: prep.units.filter((u) => !u.isNew).length,
      errors: errors.sort((x, y) => (x.row ?? 0) - (y.row ?? 0)), warnings, durationMs: Date.now() - t0, ...extra,
    };
  };
  if (mode === 'validate') return result();
  if (prep.units.length === 0) throw new AppError('IMPORT_NOTHING_VALID');

  // ---- Importación
  const batchId = randomUUID();
  const safeName = file.name.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 255) || 'archivo';
  await callSp('sp_import_batch_start', [a.tenantId, a.userId, a.ip, batchId, entity, safeName, sha256(buf), parsed.rows.length]);
  const failedUnits = new Set<Unit>();
  const fail = (units: Unit[], message: string) => {
    for (const u of units) {
      failedUnits.add(u);
      for (const row of u.rows) errors.push({ row, column: null, message: `No se guardó: ${message}` });
    }
  };
  for (let i = 0; i < prep.units.length; i += proc.chunk) {
    const chunk = prep.units.slice(i, i + proc.chunk);
    try {
      if (entity === 'CLINICAL_NOTES') {
        await callSp(proc.sp, [a.tenantId, a.userId, a.ip, batchId,
          toJson(chunk.filter((u) => u.kind === 'note').map((u) => u.payload)),
          toJson(chunk.filter((u) => u.kind === 'patient').map((u) => u.payload))]);
      } else if (entity === 'BUDGETS') {
        // Cada presupuesto se guarda por separado: el SP devuelve los que fallaron (id + error)
        const sets = await callSp(proc.sp, [a.tenantId, a.userId, a.ip, batchId, toJson(chunk.map((u) => u.payload)), opts.canEditBudgets]);
        const raw = sets[sets.length - 1]?.[0]?.failures;
        const failures = (typeof raw === 'string' ? JSON.parse(raw) : raw ?? []) as { id: string; error: string | null }[];
        for (const f of failures) {
          const unit = chunk.find((u) => u.payload.id === f.id);
          const e = AppError.fromDb({ sqlState: '45000', sqlMessage: f.error ?? '' });
          if (unit) fail([unit], e instanceof AppError ? e.message : 'error inesperado al guardar el presupuesto.');
        }
      } else {
        await callSp(proc.sp, [a.tenantId, a.userId, a.ip, batchId, toJson(chunk.map((u) => u.payload))]);
      }
    } catch (err) {
      // El bloque se revierte completo (salvo presupuestos, que se guardan uno a uno): se informa en sus filas
      if (!(err instanceof AppError)) console.error('[import] error en bloque', entity, err);
      fail(chunk, err instanceof AppError ? err.message : 'error inesperado al guardar este bloque de filas.');
      if (err instanceof AppError && err.code === 'IMPORT_NOT_AVAILABLE') {
        fail(prep.units.slice(i + proc.chunk), err.message);
        break;
      }
    }
  }
  const saved = prep.units.filter((u) => !failedUnits.has(u));
  const r = result({ batchId, mode });
  const status = saved.length === 0 ? 'FAILED' : r.errorRows > 0 ? 'PARTIAL' : 'COMPLETED';
  const created = saved.filter((u) => u.isNew).length;
  const updated = saved.length - created;
  await callSp('sp_import_batch_finish', [a.tenantId, a.userId, a.ip, batchId, status, r.okRows, r.errorRows, created, updated,
    Date.now() - t0, JSON.stringify(errors.slice(0, MAX_STORED_ERRORS))]);
  return { ...r, status, createCount: created, updateCount: updated, durationMs: Date.now() - t0 };
}

export const importHistory = (tenantId: string, limit = 50) => spRows<ImportBatchRow>('sp_import_batch_list', [tenantId, limit]);

/** Historia clínica (notas de evolución) de un paciente, descifrada. */
export async function listClinicalNotes(a: ImportActor, patientId: string) {
  const rows = await spRows('sp_patient_clinical_note_list', [a.tenantId, a.userId, a.ip, patientId]);
  return rows.map(({ note_enc, ...r }) => ({ ...r, note: decrypt(note_enc) }));
}

