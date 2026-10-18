import { route, tenantOf } from '@/lib/server/http';
import { brandingSchema } from '@/lib/shared/schemas';
import { setBranding } from '@/lib/server/services/platform';

export const PUT = route({ platform: false, perm: 'settings.manage' }, async ({ user, ip, body }) => {
  const b = await body(brandingSchema);
  await setBranding({ userId: user.userId, ip }, tenantOf(user), b);
  return { ok: true };
});
