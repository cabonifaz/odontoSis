import { ZodError } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { syncPushSchema, type SyncOp } from '@/lib/shared/schemas';
import { saveAppointment, saveBudget, savePatient, setAppointmentStatus, type Ctx } from '@/lib/server/services/clinic';
import { can, type SessionUser } from '@/lib/shared/types';

const PERM: Record<SyncOp['type'], string> = {
  'patient.save': 'patients.write',
  'appointment.save': 'appointments.write',
  'appointment.status': 'appointments.write',
  'budget.save': 'budgets.write',
};

async function apply(ctx: Ctx, user: SessionUser, op: SyncOp) {
  if (!can(user.permissions, PERM[op.type])) throw new AppError('FORBIDDEN');
  switch (op.type) {
    case 'patient.save': return savePatient(ctx, op.payload);
    case 'appointment.save': return saveAppointment(ctx, op.payload);
    case 'appointment.status': return setAppointmentStatus(ctx, op.payload.id, op.payload.statusCode);
    case 'budget.save': return saveBudget(ctx, op.payload, can(user.permissions, 'budgets.edit'));
  }
}

/**
 * Procesa operaciones (en línea u offline encoladas) en orden. Cada operación es idempotente
 * (upsert por id generado en el cliente), así que reintentos no duplican registros.
 */
export const POST = route({ platform: false, maxBody: 8 * 1024 * 1024, limit: { key: 'sync', max: 120, windowMs: 60_000 } }, async ({ user, ip, body }) => {
  const { ops } = await body(syncPushSchema);
  const ctx: Ctx = { tenantId: tenantOf(user), userId: user.userId, ip };
  const results = [];
  for (const op of ops) {
    try {
      const data = await apply(ctx, user, op);
      results.push({ opId: op.opId, ok: true, data: Array.isArray(data) ? undefined : data });
    } catch (e) {
      if (e instanceof AppError) results.push({ opId: op.opId, ok: false, error: { code: e.code, message: e.message } });
      else if (e instanceof ZodError) results.push({ opId: op.opId, ok: false, error: { code: 'VALIDATION', message: 'Datos inválidos' } });
      else {
        console.error('[sync] error', e instanceof Error ? e.message : String(e));
        results.push({ opId: op.opId, ok: false, error: { code: 'INTERNAL', message: 'Error inesperado al sincronizar.' } });
      }
    }
  }
  return { results };
});
