import { route } from '@/lib/server/http';
import { changePasswordSchema } from '@/lib/shared/schemas';
import { changePassword } from '@/lib/server/services/auth';

export const POST = route({ allowPending: true, limit: { key: 'pwd', max: 10, windowMs: 5 * 60_000 } }, async ({ user, body }) => {
  const { currentPassword, newPassword } = await body(changePasswordSchema);
  await changePassword(user, currentPassword, newPassword);
  return { ok: true };
});
