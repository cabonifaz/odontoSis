import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { deletePatientFile } from '@/lib/server/services/patient-files';

const id = z.string().uuid();

/** Elimina (baja lógica) el registro y su archivo. `fileId` es el id del registro (patient_file.id). */
export const DELETE = route<{ id: string; fileId: string }>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params }) => {
  await deletePatientFile({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), id.parse(params.fileId));
  return { ok: true };
});
