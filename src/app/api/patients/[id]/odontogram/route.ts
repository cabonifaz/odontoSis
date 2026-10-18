import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { odontogramMarkSchema } from '@/lib/shared/schemas';
import { getPatientOdontogram, savePatientOdontogram } from '@/lib/server/services/clinic';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, params }) =>
  ({ marks: await getPatientOdontogram(tenantOf(user), id.parse(params.id)) }));

export const PUT = route<{ id: string }>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params, body }) => {
  const { marks } = await body(z.object({ marks: z.array(odontogramMarkSchema).max(500) }));
  await savePatientOdontogram({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), marks);
  return { ok: true };
});
