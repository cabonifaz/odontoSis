import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { guaranteeLetterSchema } from '@/lib/shared/referral-schemas';
import { listGuaranteeLetters, saveGuaranteeLetter } from '@/lib/server/services/referrals';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, params }) =>
  ({ rows: await listGuaranteeLetters(tenantOf(user), id.parse(params.id)) }));

/** Crea o actualiza (upsert por id generado en el cliente). */
export const POST = route<{ id: string }>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params, body }) => {
  const data = await body(guaranteeLetterSchema);
  await saveGuaranteeLetter({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), data);
  return { ok: true, id: data.id };
});
