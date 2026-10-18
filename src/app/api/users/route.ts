import { route, tenantOf } from '@/lib/server/http';
import { userCreateSchema } from '@/lib/shared/schemas';
import { createUser, listRoles, listUsers, tenantUsage } from '@/lib/server/services/users';

export const GET = route({ platform: false, perm: 'users.manage' }, async ({ user }) => {
  const t = tenantOf(user);
  const [users, roles, usage] = await Promise.all([listUsers(t), listRoles(t), tenantUsage(t)]);
  return { users, roles, usage };
});

export const POST = route({ platform: false, perm: 'users.manage' }, async ({ user, ip, body }) =>
  createUser(tenantOf(user), { userId: user.userId, ip }, await body(userCreateSchema)));
