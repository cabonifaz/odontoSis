import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { deleteGuaranteeLetter, getGuaranteeLetter } from '@/lib/server/services/referrals';

const id = z.string().uuid();
type P = { id: string; letterId: string };

export const GET = route<P>({ platform: false, perm: 'patients.read' }, async ({ user, params }) => {
  const g = await getGuaranteeLetter(tenantOf(user), id.parse(params.id), id.parse(params.letterId));
  if (!g) throw new AppError('NOT_FOUND');
  return g;
});

export const DELETE = route<P>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params }) => {
  await deleteGuaranteeLetter({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), id.parse(params.letterId));
  return { ok: true };
});
