import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { savePatientUpload, uploadAndSavePatientFile } from '@/lib/server/services/patient-files';
import { patientFileMetaSchema } from '@/lib/shared/patient-file-schemas';

const id = z.string().uuid();
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : undefined);

/**
 * Subida de un archivo del paciente (multipart/form-data).
 *  - `file` (obligatorio): JPG, PNG, WEBP o PDF de hasta 15 MB (validado por magic bytes).
 *  - Con `typeId` y `title` (+ `description`, `takenAt`, `toothCode` opcionales) se registra en la ficha
 *    en la misma petición y se devuelve también `record`.
 *  - Sin metadata sólo se sube el binario y se devuelve `{ id, mime, name, size }` (luego POST /files).
 */
export const POST = route<{ id: string }>(
  { platform: false, perm: 'patients.write', limit: { key: 'patient-upload', max: 60, windowMs: 60_000 } },
  async ({ req, user, ip, params }) => {
    const c = { tenantId: tenantOf(user), userId: user.userId, ip };
    const patientId = id.parse(params.id);
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File)) throw new AppError('INVALID_FILE', 400, 'Adjunta un archivo.');

    if (!form.has('typeId') && !form.has('title')) return savePatientUpload(c, patientId, file);

    // La metadata se valida ANTES de escribir en disco
    const meta = patientFileMetaSchema.parse({
      typeId: str(form.get('typeId')), title: str(form.get('title')), description: str(form.get('description')),
      takenAt: str(form.get('takenAt')), toothCode: str(form.get('toothCode')),
    });
    return uploadAndSavePatientFile(c, patientId, file, meta);
  },
);
