import { route, tenantOf } from '@/lib/server/http';
import { syncPull } from '@/lib/server/services/clinic';
import { rateLimit } from '@/lib/server/rate-limit';

/** Descarga incremental para trabajar sin conexión. Limitada por usuario: una descarga completa descifra toda la clínica. */
export const GET = route({ platform: false }, async ({ req, user }) => {
  rateLimit(`sync-pull:${user.userId}`, 30, 60_000);
  const since = req.nextUrl.searchParams.get('since');
  const valid = since && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(since) ? since : null;
  return syncPull(tenantOf(user), valid, user.permissions);
});
