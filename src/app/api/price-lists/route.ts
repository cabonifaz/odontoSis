import { route, tenantOf } from '@/lib/server/http';
import { priceListSchema } from '@/lib/shared/schemas';
import { listPriceLists, savePriceList } from '@/lib/server/services/clinic';

/** Tarifarios (listas de precios) de la clínica */
export const GET = route({ platform: false }, async ({ req, user }) => listPriceLists(tenantOf(user), req.nextUrl.searchParams.get('all') === '1'));

export const POST = route({ platform: false, perm: 'services.write' }, async ({ user, ip, body }) => {
  const l = await body(priceListSchema);
  await savePriceList({ tenantId: tenantOf(user), userId: user.userId, ip }, l);
  return { id: l.id };
});
