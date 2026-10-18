import { route } from '@/lib/server/http';
import { loginSchema } from '@/lib/shared/schemas';
import { login } from '@/lib/server/services/auth';

export const POST = route({ public: true, limit: { key: 'login', max: 10, windowMs: 5 * 60_000 } }, async ({ body }) => {
  const { email, password, tenantCode } = await body(loginSchema);
  return login(email, password, tenantCode);
});
