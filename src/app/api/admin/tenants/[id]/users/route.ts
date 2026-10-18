import { z } from 'zod';
import { route } from '@/lib/server/http';
import { userCreateSchema } from '@/lib/shared/schemas';
import { createUser, listRoles, listUsers, tenantUsage } from '@/lib/server/services/users';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: true }, async ({ params }) => {
  const t = id.parse(params.id);
  const [users, roles, usage] = await Promise.all([listUsers(t), listRoles(t), tenantUsage(t)]);
  return { users, roles, usage };
});

export const POST = route<{ id: string }>({ platform: true }, async ({ user, ip, params, body }) =>
  createUser(id.parse(params.id), { userId: user.userId, ip }, await body(userCreateSchema)));
