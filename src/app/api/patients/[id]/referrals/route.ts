import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { referralSchema } from '@/lib/shared/referral-schemas';
import { listReferrals, saveReferral } from '@/lib/server/services/referrals';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, params }) =>
  ({ rows: await listReferrals(tenantOf(user), id.parse(params.id)) }));

/** Crea o actualiza (upsert por id generado en el cliente). */
export const POST = route<{ id: string }>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params, body }) => {
  const data = await body(referralSchema);
  await saveReferral({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), data);
  return { ok: true, id: data.id };
});
