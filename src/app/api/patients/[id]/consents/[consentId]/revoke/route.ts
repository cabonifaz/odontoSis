import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { revokeConsent } from '@/lib/server/services/consents';
import { consentRevokeSchema } from '@/lib/shared/schemas';

/** Revocación del consentimiento por el titular (queda en el historial con fecha y motivo) */
export const POST = route<{ id: string; consentId: string }>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params, body }) => {
  await revokeConsent({ tenantId: tenantOf(user), userId: user.userId, ip }, z.string().uuid().parse(params.consentId), await body(consentRevokeSchema));
  return { ok: true };
});
