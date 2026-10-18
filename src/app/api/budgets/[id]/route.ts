import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { deleteBudget, getBudget } from '@/lib/server/services/clinic';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: false, perm: 'budgets.read' }, async ({ user, params }) => {
  const b = await getBudget(tenantOf(user), id.parse(params.id));
  if (!b) throw new AppError('NOT_FOUND');
  return b;
});

export const DELETE = route<{ id: string }>({ platform: false, perm: 'budgets.edit' }, async ({ user, ip, params }) => {
  await deleteBudget({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id));
  return { ok: true };
});
