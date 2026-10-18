import { z } from 'zod';
import { route } from '@/lib/server/http';
import { requestUpdateSchema } from '@/lib/shared/schemas';
import { updateRequest } from '@/lib/server/services/platform';

/** Atención de una solicitud: estado + respuesta a la clínica */
export const PUT = route<{ id: string }>({ platform: true }, async ({ user, ip, params, body }) => {
  await updateRequest({ userId: user.userId, ip }, z.string().uuid().parse(params.id), await body(requestUpdateSchema));
  return { ok: true };
});
