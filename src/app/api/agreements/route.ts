import { route, tenantOf } from '@/lib/server/http';
import { agreementSchema } from '@/lib/shared/schemas';
import { listAgreements, saveAgreement } from '@/lib/server/services/clinic';

export const GET = route({ platform: false, perm: 'patients.read' }, async ({ req, user }) =>
  listAgreements(tenantOf(user), req.nextUrl.searchParams.get('all') === '1'));

export const POST = route({ platform: false, perm: 'settings.manage' }, async ({ user, ip, body }) => {
  const a = await body(agreementSchema);
  await saveAgreement({ tenantId: tenantOf(user), userId: user.userId, ip }, a);
  return { id: a.id };
});
