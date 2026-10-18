import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { deletePatient, getPatient } from '@/lib/server/services/clinic';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, ip, params }) => {
  const p = await getPatient({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id));
  if (!p) throw new AppError('NOT_FOUND');
  return p;
});

export const DELETE = route<{ id: string }>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params }) => {
  await deletePatient({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id));
  return { ok: true };
});
