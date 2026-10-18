import { z } from 'zod';
import { route } from '@/lib/server/http';
import { contractSchema } from '@/lib/shared/schemas';
import { listContracts, saveContract } from '@/lib/server/services/platform';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: true }, async ({ params }) => listContracts(id.parse(params.id)));

export const POST = route<{ id: string }>({ platform: true }, async ({ user, ip, params, body }) => {
  const c = await body(contractSchema);
  await saveContract({ userId: user.userId, ip }, id.parse(params.id), c);
  return { id: c.id };
});
