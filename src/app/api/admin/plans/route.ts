import { route } from '@/lib/server/http';
import { planSchema } from '@/lib/shared/schemas';
import { listPlans, savePlan } from '@/lib/server/services/platform';

export const GET = route({ platform: true }, async () => listPlans());

export const POST = route({ platform: true }, async ({ user, ip, body }) => {
  const p = await body(planSchema);
  await savePlan({ userId: user.userId, ip }, p);
  return { id: p.id };
});
