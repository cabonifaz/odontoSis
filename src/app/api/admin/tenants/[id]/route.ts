import { z } from 'zod';
import { route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { tenantUpdateSchema } from '@/lib/shared/schemas';
import { getTenant, updateTenant } from '@/lib/server/services/platform';

const id = z.string().uuid();

export const GET = route<{ id: string }>({ platform: true }, async ({ params }) => {
  const t = await getTenant(id.parse(params.id));
  if (!t) throw new AppError('NOT_FOUND');
  return t;
});

export const PUT = route<{ id: string }>({ platform: true }, async ({ user, ip, params, body }) => {
  await updateTenant({ userId: user.userId, ip }, id.parse(params.id), await body(tenantUpdateSchema));
  return { ok: true };
});
