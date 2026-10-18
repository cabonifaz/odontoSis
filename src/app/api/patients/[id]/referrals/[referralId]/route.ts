import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { deleteReferral, getReferral } from '@/lib/server/services/referrals';

const id = z.string().uuid();
type P = { id: string; referralId: string };

/** Hoja de derivación (para imprimir). */
export const GET = route<P>({ platform: false, perm: 'patients.read' }, async ({ user, params }) => {
  const r = await getReferral(tenantOf(user), id.parse(params.id), id.parse(params.referralId));
  if (!r) throw new AppError('NOT_FOUND');
  return r;
});

export const DELETE = route<P>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params }) => {
  await deleteReferral({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), id.parse(params.referralId));
  return { ok: true };
});
