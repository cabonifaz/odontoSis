import { route } from '@/lib/server/http';
import { tenantCreateSchema } from '@/lib/shared/schemas';
import { createTenant, listTenants } from '@/lib/server/services/platform';

export const GET = route({ platform: true }, async ({ req }) => listTenants(req.nextUrl.searchParams.get('q')?.slice(0, 100)));

export const POST = route({ platform: true }, async ({ user, ip, body }) =>
  createTenant({ userId: user.userId, ip }, await body(tenantCreateSchema)));
