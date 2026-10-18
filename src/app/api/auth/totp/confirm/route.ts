import { route } from '@/lib/server/http';
import { mfaSchema } from '@/lib/shared/schemas';
import { confirmTotpSetup } from '@/lib/server/services/auth';

export const POST = route({ allowPending: true, limit: { key: 'totp', max: 10, windowMs: 5 * 60_000 } }, async ({ user, body }) => {
  const { code } = await body(mfaSchema);
  await confirmTotpSetup(user, code);
  return { ok: true };
});
