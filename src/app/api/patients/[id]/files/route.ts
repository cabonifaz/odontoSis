import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { listPatientFiles, savePatientFile } from '@/lib/server/services/patient-files';
import { patientFileSchema } from '@/lib/shared/patient-file-schemas';

const id = z.string().uuid();

/** Imágenes y archivos del paciente. */
export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, params }) =>
  ({ files: await listPatientFiles(tenantOf(user), id.parse(params.id)) }));

/** Alta (vincula un archivo ya subido) o edición de la metadata (mismo id y fileId). */
export const POST = route<{ id: string }>({ platform: false, perm: 'patients.write' }, async ({ user, ip, params, body }) => {
  const c = { tenantId: tenantOf(user), userId: user.userId, ip };
  const patientId = id.parse(params.id);
  const f = await body(patientFileSchema);
  await savePatientFile(c, patientId, f);
  const record = (await listPatientFiles(c.tenantId, patientId)).find((r) => r.id === f.id) ?? null;
  return { ok: true, record };
});
