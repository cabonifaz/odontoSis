import { z } from 'zod';
import { route } from '@/lib/server/http';
import { deleteBranch } from '@/lib/server/services/clinic';

const id = z.string().uuid();

export const DELETE = route<{ id: string; branchId: string }>({ platform: true }, async ({ user, ip, params }) => {
  await deleteBranch({ tenantId: id.parse(params.id), userId: user.userId, ip }, id.parse(params.branchId));
  return { ok: true };
});
