import { route, tenantOf } from '@/lib/server/http';
import { tenantSettingsSchema } from '@/lib/shared/schemas';
import { updateSettings } from '@/lib/server/services/clinic';
import { getTenant } from '@/lib/server/services/platform';
import { tenantUsage } from '@/lib/server/services/users';

export const GET = route({ platform: false, perm: 'settings.manage' }, async ({ user }) => {
  const t = await getTenant(tenantOf(user));
  return { tenant: t, usage: await tenantUsage(tenantOf(user)) };
});

export const PUT = route({ platform: false, perm: 'settings.manage' }, async ({ user, ip, body }) => {
  const s = await body(tenantSettingsSchema);
  await updateSettings({ tenantId: tenantOf(user), userId: user.userId, ip }, s);
  return { ok: true };
});
