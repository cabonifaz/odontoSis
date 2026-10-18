import { route, tenantOf } from '@/lib/server/http';
import { syncPull } from '@/lib/server/services/clinic';

export const GET = route({ platform: false }, async ({ req, user }) => {
  const since = req.nextUrl.searchParams.get('since');
  const valid = since && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(since) ? since : null;
  return syncPull(tenantOf(user), valid);
});
