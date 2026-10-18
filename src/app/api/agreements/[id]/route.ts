import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { deleteAgreement } from '@/lib/server/services/clinic';

export const DELETE = route<{ id: string }>({ platform: false, perm: 'settings.manage' }, async ({ user, ip, params }) => {
  await deleteAgreement({ tenantId: tenantOf(user), userId: user.userId, ip }, z.string().uuid().parse(params.id));
  return { ok: true };
});
