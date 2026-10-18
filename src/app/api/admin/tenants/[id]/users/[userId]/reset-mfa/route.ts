import { z } from 'zod';
import { route } from '@/lib/server/http';
import { resetUserMfa } from '@/lib/server/services/auth';

const id = z.string().uuid();

/** El super admin restablece el 2FA de un usuario de una clínica. */
export const POST = route<{ id: string; userId: string }>({ platform: true }, async ({ user, ip, params }) => {
  await resetUserMfa({ userId: user.userId, ip }, id.parse(params.id), id.parse(params.userId));
  return { ok: true };
});
