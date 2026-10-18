import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { resetUserPassword } from '@/lib/server/services/users';

export const POST = route<{ id: string }>({ platform: false, perm: 'users.manage' }, async ({ user, ip, params }) =>
  resetUserPassword(tenantOf(user), { userId: user.userId, ip }, z.string().uuid().parse(params.id)));
