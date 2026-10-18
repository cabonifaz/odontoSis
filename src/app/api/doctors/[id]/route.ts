import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { deleteDoctor } from '@/lib/server/services/clinic';

export const DELETE = route<{ id: string }>({ platform: false, perm: 'doctors.write' }, async ({ user, ip, params }) => {
  await deleteDoctor({ tenantId: tenantOf(user), userId: user.userId, ip }, z.string().uuid().parse(params.id));
  return { ok: true };
});
