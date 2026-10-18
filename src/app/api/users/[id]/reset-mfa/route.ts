import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { resetUserMfa } from '@/lib/server/services/auth';

/** El admin de la clínica restablece el 2FA de un usuario que perdió su autenticador. */
export const POST = route<{ id: string }>({ platform: false, perm: 'users.manage', limit: { key: 'reset-mfa', max: 20, windowMs: 60 * 60_000 } },
  async ({ user, ip, params }) => {
    await resetUserMfa({ userId: user.userId, ip }, tenantOf(user), z.string().uuid().parse(params.id));
    return { ok: true };
  });
