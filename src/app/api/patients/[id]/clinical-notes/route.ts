import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { listClinicalNotes } from '@/lib/server/services/bulk-import';

const id = z.string().uuid();

/** Historia clínica (notas de evolución) del paciente. Sólo lectura; la lectura queda en la bitácora. */
export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, ip, params }) =>
  ({ rows: await listClinicalNotes({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id)) }));
