import { route, tenantOf } from '@/lib/server/http';
import { listBranches } from '@/lib/server/services/clinic';
import { tenantUsage } from '@/lib/server/services/users';

/** Sedes de la clínica (sólo lectura: las habilita el super admin según el plan) */
export const GET = route({ platform: false }, async ({ req, user }) => {
  const t = tenantOf(user);
  const [branches, usage] = await Promise.all([listBranches(t, req.nextUrl.searchParams.get('all') === '1'), tenantUsage(t)]);
  return { branches, usage };
});
