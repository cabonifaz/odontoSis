import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { setBudgetStatus } from '@/lib/server/services/clinic';

export const POST = route<{ id: string }>({ platform: false, perm: 'budgets.edit' }, async ({ user, ip, params, body }) => {
  const { statusCode } = await body(z.object({ statusCode: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED']) }));
  await setBudgetStatus({ tenantId: tenantOf(user), userId: user.userId, ip }, z.string().uuid().parse(params.id), statusCode);
  return { ok: true };
});
