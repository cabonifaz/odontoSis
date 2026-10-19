import { z } from 'zod';
import { route } from '@/lib/server/http';
import { markNotificationsRead } from '@/lib/server/services/notifications';

const schema = z.object({
  id: z.string().uuid().nullish(),
  area: z.string().regex(/^[a-z]{1,30}$/).nullish(),
});

/** Marca como leídas una notificación, las de un área o todas (sólo las propias) */
export const POST = route({ allowPending: true, limit: { key: 'notif-read', max: 120, windowMs: 60_000 } }, async ({ user, body }) => {
  await markNotificationsRead(user.userId, await body(schema));
  return { ok: true };
});
