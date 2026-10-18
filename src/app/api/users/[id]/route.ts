import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { userUpdateSchema } from '@/lib/shared/schemas';
import { deleteUser, updateUser } from '@/lib/server/services/users';

const id = z.string().uuid();

export const PUT = route<{ id: string }>({ platform: false, perm: 'users.manage' }, async ({ user, ip, params, body }) => {
  await updateUser(tenantOf(user), { userId: user.userId, ip }, id.parse(params.id), await body(userUpdateSchema));
  return { ok: true };
});

export const DELETE = route<{ id: string }>({ platform: false, perm: 'users.manage' }, async ({ user, ip, params }) => {
  await deleteUser(tenantOf(user), { userId: user.userId, ip }, id.parse(params.id));
  return { ok: true };
});
