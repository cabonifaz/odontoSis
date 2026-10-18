import { route, tenantOf } from '@/lib/server/http';
import { requestCreateSchema } from '@/lib/shared/schemas';
import { createRequest, listRequests } from '@/lib/server/services/platform';

/** Solicitudes de la clínica (mejoras, errores, consultas, capacitación) a la plataforma. */
export const GET = route({ platform: false }, async ({ user }) => listRequests(tenantOf(user)));

export const POST = route({ platform: false, limit: { key: 'requests', max: 20, windowMs: 60 * 60_000 } }, async ({ user, ip, body }) => {
  const r = await body(requestCreateSchema);
  await createRequest(tenantOf(user), { userId: user.userId, ip }, r);
  return { id: r.id };
});
