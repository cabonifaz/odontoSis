import { z } from 'zod';
import { route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { dniLookupEnabled, lookupDni } from '@/lib/server/services/identity';
import { can } from '@/lib/shared/types';

/** ¿Está configurada la consulta? (sin costo) */
export const GET = route({ platform: false }, async () => ({ enabled: dniLookupEnabled() }));

/**
 * Datos personales por DNI (RENIEC) para evitar errores de digitación. Consume cupo pagado, por eso:
 * POST (no se dispara con un enlace), sólo quien registra personas (pacientes, doctores o usuarios) y límites por IP/usuario.
 */
export const POST = route({ platform: false, limit: { key: 'dni', max: 20, windowMs: 60_000 } }, async ({ user, body }) => {
  if (!['patients.write', 'doctors.write', 'users.manage'].some((p) => can(user.permissions, p))) throw new AppError('FORBIDDEN');
  const { numero } = await body(z.object({ numero: z.string().trim().regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos') }));
  return lookupDni(numero, { userId: user.userId, tenantId: user.tenant?.id ?? null });
});
