import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { priceListItemSchema } from '@/lib/shared/schemas';
import { deletePriceList, priceListItems, setPriceListItem } from '@/lib/server/services/clinic';

const id = z.string().uuid();

/** Precios de los servicios en el tarifario (propio o el base) */
export const GET = route<{ id: string }>({ platform: false, perm: 'services.read' }, async ({ user, params }) =>
  priceListItems(tenantOf(user), id.parse(params.id)));

/** Define o quita (price: null) el precio de un servicio en el tarifario */
export const PUT = route<{ id: string }>({ platform: false, perm: 'services.write' }, async ({ user, ip, params, body }) => {
  const { serviceId, price } = await body(priceListItemSchema);
  await setPriceListItem({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), serviceId, price);
  return { ok: true };
});

export const DELETE = route<{ id: string }>({ platform: false, perm: 'services.write' }, async ({ user, ip, params }) => {
  await deletePriceList({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id));
  return { ok: true };
});
