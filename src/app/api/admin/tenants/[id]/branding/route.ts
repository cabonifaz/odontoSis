import { z } from 'zod';
import { route } from '@/lib/server/http';
import { brandingSchema } from '@/lib/shared/schemas';
import { setBranding } from '@/lib/server/services/platform';

export const PUT = route<{ id: string }>({ platform: true }, async ({ user, ip, params, body }) => {
  await setBranding({ userId: user.userId, ip }, z.string().uuid().parse(params.id), await body(brandingSchema));
  return { ok: true };
});
