import { route, tenantOf } from '@/lib/server/http';
import { listBudgets } from '@/lib/server/services/clinic';

export const GET = route({ platform: false, perm: 'budgets.read' }, async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const patientId = sp.get('patientId');
  return listBudgets(tenantOf(user), {
    search: sp.get('q')?.slice(0, 100),
    patientId: patientId && /^[0-9a-f-]{36}$/i.test(patientId) ? patientId : null,
    status: sp.get('status')?.slice(0, 40),
    limit: Math.min(Math.max(Math.trunc(Number(sp.get('limit') ?? 50)) || 50, 1), 200),
    offset: Math.min(Math.max(Math.trunc(Number(sp.get('offset') ?? 0)) || 0, 0), 1_000_000),
  });
});
