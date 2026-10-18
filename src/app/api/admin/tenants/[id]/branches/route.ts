import { z } from 'zod';
import { route } from '@/lib/server/http';
import { branchSchema } from '@/lib/shared/schemas';
import { listBranches, saveBranch } from '@/lib/server/services/clinic';
import { tenantUsage } from '@/lib/server/services/users';

const id = z.string().uuid();

/** Sedes de una clínica (super admin). El límite de sedes activas lo valida el SP. */
export const GET = route<{ id: string }>({ platform: true }, async ({ params }) => {
  const t = id.parse(params.id);
  const [branches, usage] = await Promise.all([listBranches(t, true), tenantUsage(t)]);
  return { branches, usage };
});

export const POST = route<{ id: string }>({ platform: true }, async ({ user, ip, params, body }) => {
  const b = await body(branchSchema);
  await saveBranch({ tenantId: id.parse(params.id), userId: user.userId, ip }, b);
  return { id: b.id };
});
