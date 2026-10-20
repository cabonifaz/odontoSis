import { route } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';
import { notificationsFor } from '@/lib/server/services/notifications';

/** Notificaciones del usuario actual (se consulta cada minuto y al volver a la pestaña) */
export const GET = route({ allowPending: true }, async ({ req, user }) => {
  rateLimit(`notifications:${user.userId}`, 120, 60_000);
  const area = req.nextUrl.searchParams.get('area');
  return notificationsFor(user.userId, area && /^[a-z]{1,30}$/.test(area) ? area : null, 20, user.isPlatform);
});
