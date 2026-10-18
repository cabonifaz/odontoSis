import { route } from '@/lib/server/http';
import { destroySession } from '@/lib/server/session';

export const POST = route({ public: true }, async () => {
  await destroySession();
  return { ok: true };
});
