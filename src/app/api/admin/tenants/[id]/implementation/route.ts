import { z } from 'zod';
import { route } from '@/lib/server/http';
import { implementationExtendSchema } from '@/lib/shared/schemas';
import { extendImplementation, implementationHistory } from '@/lib/server/services/platform';

const id = z.string().uuid();

/** Historial de ampliaciones del periodo de implementación */
export const GET = route<{ id: string }>({ platform: true }, async ({ params }) => implementationHistory(id.parse(params.id)));

/** Amplía el periodo de implementación (nueva fecha de fin + motivo) */
export const POST = route<{ id: string }>({ platform: true }, async ({ user, ip, params, body }) => {
  const { newEnd, reason } = await body(implementationExtendSchema);
  await extendImplementation({ userId: user.userId, ip }, id.parse(params.id), newEnd, reason);
  return { ok: true };
});
