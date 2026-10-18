import { z } from 'zod';
import { route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { deleteMasterItem } from '@/lib/server/services/clinic';
import { can } from '@/lib/shared/types';

export const DELETE = route<{ id: string }>({}, async ({ user, ip, params }) => {
  if (!user.isPlatform && !can(user.permissions, 'catalogs.manage')) throw new AppError('FORBIDDEN');
  await deleteMasterItem(user.tenant?.id ?? null, { userId: user.userId, ip }, z.string().uuid().parse(params.id));
  return { ok: true };
});
