import { route } from '@/lib/server/http';
import { profileSchema } from '@/lib/shared/schemas';
import { updateProfile } from '@/lib/server/services/users';

/** El usuario edita su propio perfil: nombre, apodo, avatar y cumpleaños */
export const PUT = route({ allowPending: true }, async ({ user, ip, body }) => {
  await updateProfile(user.userId, ip, await body(profileSchema));
  return { ok: true };
});
