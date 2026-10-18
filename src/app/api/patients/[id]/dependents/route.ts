import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { patientDependents } from '@/lib/server/services/clinic';

/** Dependientes (familiares) vinculados a un paciente titular */
export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, params }) =>
  patientDependents(tenantOf(user), z.string().uuid().parse(params.id)));
