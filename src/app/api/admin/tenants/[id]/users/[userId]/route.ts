import { z } from 'zod';
import { route } from '@/lib/server/http';
import { userUpdateSchema } from '@/lib/shared/schemas';
import { deleteUser, updateUser } from '@/lib/server/services/users';

const id = z.string().uuid();
type P = { id: string; userId: string };

export const PUT = route<P>({ platform: true }, async ({ user, ip, params, body }) => {
  await updateUser(id.parse(params.id), { userId: user.userId, ip }, id.parse(params.userId), await body(userUpdateSchema));
  return { ok: true };
});

export const DELETE = route<P>({ platform: true }, async ({ user, ip, params }) => {
  await deleteUser(id.parse(params.id), { userId: user.userId, ip }, id.parse(params.userId));
  return { ok: true };
});
