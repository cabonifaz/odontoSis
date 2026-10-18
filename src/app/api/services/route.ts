import { route, tenantOf } from '@/lib/server/http';
import { serviceSchema } from '@/lib/shared/schemas';
import { listServices, saveService } from '@/lib/server/services/clinic';

export const GET = route({ platform: false, perm: 'services.read' }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  return listServices(tenantOf(user), sp.get('q')?.slice(0, 100), sp.get('all') === '1');
});

export const POST = route({ platform: false, perm: 'services.write' }, async ({ user, ip, body }) => {
  const s = await body(serviceSchema);
  await saveService({ tenantId: tenantOf(user), userId: user.userId, ip }, s);
  return { id: s.id };
});
