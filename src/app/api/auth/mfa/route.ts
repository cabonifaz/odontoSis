import { route } from '@/lib/server/http';
import { mfaSchema } from '@/lib/shared/schemas';
import { verifyMfa } from '@/lib/server/services/auth';

export const POST = route({ allowMfaPending: true, limit: { key: 'mfa', max: 10, windowMs: 5 * 60_000 } }, async ({ user, body }) => {
  const { code } = await body(mfaSchema);
  await verifyMfa(user, code);
  return { ok: true };
});
