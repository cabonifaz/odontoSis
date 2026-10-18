import { route } from '@/lib/server/http';
import { paymentSchema } from '@/lib/shared/schemas';
import { listPayments, savePayment } from '@/lib/server/services/platform';

export const GET = route({ platform: true }, async ({ req }) => {
  const t = req.nextUrl.searchParams.get('tenantId');
  return listPayments(t && /^[0-9a-f-]{36}$/i.test(t) ? t : null);
});

export const POST = route({ platform: true }, async ({ user, ip, body }) => {
  const p = await body(paymentSchema);
  await savePayment({ userId: user.userId, ip }, p);
  return { id: p.id };
});
