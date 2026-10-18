import 'server-only';
import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { AppError } from '../errors';
import { rateLimit } from '../rate-limit';
import { assertImplementation, importHistory, runImport, type ImportActor } from '../services/bulk-import';
import { buildTemplateCsv, buildTemplateXlsx } from './templates';
import { IMPORT_ENTITIES, MAX_IMPORT_BYTES, specBySlug, type ImportEntity } from '@/lib/shared/import-spec';
import { can, type TenantPhase } from '@/lib/shared/types';

/** Handlers compartidos por la clínica (/api/import) y el super admin (/api/admin/tenants/[id]/import). */
const modeSchema = z.enum(['validate', 'import'], { message: 'Modo inválido' });
const entitySchema = z.enum(IMPORT_ENTITIES, { message: 'Entidad inválida' });

/** Tamaño máximo del cuerpo multipart de una carga (archivo + campos). */
export const IMPORT_MAX_BODY = MAX_IMPORT_BYTES + 64 * 1024;

/** Permiso de escritura que exige cada entidad (además de settings.manage para entrar a la carga masiva). */
const ENTITY_PERM: Record<ImportEntity, string> = {
  DOCTORS: 'doctors.write',
  AGREEMENTS: 'settings.manage',
  SERVICES: 'services.write',
  PRICE_LIST_ITEMS: 'services.write',
  PATIENTS: 'patients.write',
  CLINICAL_NOTES: 'patients.write',
  APPOINTMENTS: 'appointments.write',
  BUDGETS: 'budgets.write',
};

// ---- Cerrojo por clínica: una carga a la vez por clínica y como máximo 2 en todo el servidor ----
const MAX_GLOBAL_IMPORTS = 2;
const store = globalThis as unknown as { __odxImportLocks?: Set<string> };
const locks = (store.__odxImportLocks ??= new Set<string>());

async function withImportLock<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  if (locks.has(tenantId)) throw new AppError('IMPORT_BUSY');
  if (locks.size >= MAX_GLOBAL_IMPORTS) throw new AppError('IMPORT_SERVER_BUSY');
  locks.add(tenantId);
  try { return await fn(); } finally { locks.delete(tenantId); }
}

export async function handleImportPost(req: NextRequest, actor: ImportActor, phase: TenantPhase | null, permissions: string[]) {
  assertImplementation(phase);
  // Límite por usuario y clínica (además del límite por IP de route())
  rateLimit(`import:${actor.userId}:${actor.tenantId}`, 60, 60_000); // 8 pasos × (validar + importar) con reintentos
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > IMPORT_MAX_BODY) throw new AppError('IMPORT_INVALID_FILE');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File)) throw new AppError('IMPORT_INVALID_FILE');
  const entity = entitySchema.parse(form.get('entity'));
  const mode = modeSchema.parse(form.get('mode') ?? 'validate');
  if (!can(permissions, ENTITY_PERM[entity])) throw new AppError('FORBIDDEN', 403, 'No tienes permiso para cargar estos datos.');
  return withImportLock(actor.tenantId, () =>
    runImport(actor, entity, file, mode, { canEditBudgets: can(permissions, 'budgets.edit') }));
}

export async function handleImportHistory(tenantId: string, phase: TenantPhase | null) {
  return { available: phase === 'IMPLEMENTATION', history: await importHistory(tenantId) };
}

export async function handleTemplate(req: NextRequest, tenantId: string, slug: string, phase: TenantPhase | null) {
  assertImplementation(phase);
  const spec = specBySlug(slug);
  if (!spec) throw new AppError('NOT_FOUND');
  const csv = req.nextUrl.searchParams.get('format') === 'csv';
  const data = csv ? buildTemplateCsv(spec) : await buildTemplateXlsx(tenantId, spec);
  const name = `plantilla-${spec.step}-${spec.slug}${csv ? '-ejemplo.csv' : '.xlsx'}`;
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
