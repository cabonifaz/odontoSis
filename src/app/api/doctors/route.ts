import { route, tenantOf } from '@/lib/server/http';
import { doctorSchema } from '@/lib/shared/schemas';
import { listDoctors, saveDoctor } from '@/lib/server/services/clinic';

export const GET = route({ platform: false, perm: 'doctors.read' }, async ({ req, user }) =>
  listDoctors(tenantOf(user), req.nextUrl.searchParams.get('all') === '1'));

export const POST = route({ platform: false, perm: 'doctors.write' }, async ({ user, ip, body }) => {
  const d = await body(doctorSchema);
  await saveDoctor({ tenantId: tenantOf(user), userId: user.userId, ip }, d);
  return { id: d.id };
});
