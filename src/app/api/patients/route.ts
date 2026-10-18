import { route, tenantOf } from '@/lib/server/http';
import { listPatients } from '@/lib/server/services/clinic';

export const GET = route({ platform: false, perm: 'patients.read' }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  return listPatients(tenantOf(user), {
    search: sp.get('q')?.slice(0, 100),
    limit: Math.min(Number(sp.get('limit') ?? 50) || 50, 200),
    offset: Math.max(Number(sp.get('offset') ?? 0) || 0, 0),
  });
});
