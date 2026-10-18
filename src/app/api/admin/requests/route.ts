import { route } from '@/lib/server/http';
import { listRequests } from '@/lib/server/services/platform';

export const GET = route({ platform: true }, async ({ req }) => {
  const t = req.nextUrl.searchParams.get('tenantId');
  return listRequests(t && /^[0-9a-f-]{36}$/i.test(t) ? t : null, req.nextUrl.searchParams.get('status')?.slice(0, 40));
});
