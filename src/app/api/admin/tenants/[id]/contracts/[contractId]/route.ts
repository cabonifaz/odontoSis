import { z } from 'zod';
import { route } from '@/lib/server/http';
import { deleteContract } from '@/lib/server/services/platform';

const id = z.string().uuid();

export const DELETE = route<{ id: string; contractId: string }>({ platform: true }, async ({ user, ip, params }) => {
  await deleteContract({ userId: user.userId, ip }, id.parse(params.id), id.parse(params.contractId));
  return { ok: true };
});
