import { z } from 'zod';

/** Imágenes y archivos del paciente: esquemas compartidos cliente/servidor (el servidor SIEMPRE re-valida). */

/** Tipos permitidos (validados en el servidor por magic bytes) y tamaño máximo */
export const PATIENT_FILE_MAX_BYTES = 15 * 1024 * 1024;
export const PATIENT_FILE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const PATIENT_FILE_ACCEPT = PATIENT_FILE_MIME.join(',');

/** Pieza dental FDI (permanentes 1.1–4.8, temporales 5.1–8.5). Acepta '45' o '4.5' y normaliza a '4.5'. */
export const toothCodeSchema = z.string().trim()
  .regex(/^([1-4]\.?[1-8]|[5-8]\.?[1-5])$/, 'Pieza FDI inválida (p. ej. 4.5)')
  .transform((v) => `${v[0]}.${v[v.length - 1]}`);

const optStr = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullish()
  .or(z.literal('').transform(() => null)).transform((v) => v ?? null);
const optTooth = toothCodeSchema.nullish().or(z.literal('').transform(() => null)).transform((v) => v ?? null);

export const patientFileMetaSchema = z.object({
  typeId: z.string().uuid('Selecciona el tipo de archivo'),
  title: z.string().trim().min(1, 'Ingresa un título').max(150),
  description: optStr(500),
  takenAt: optDate,
  toothCode: optTooth,
});

/** Alta/edición del registro (el archivo ya fue subido con /api/patients/{id}/files/upload) */
export const patientFileSchema = patientFileMetaSchema.extend({
  id: z.string().uuid(),
  fileId: z.string().uuid(),
});

export type PatientFileMeta = z.infer<typeof patientFileMetaSchema>;
export type PatientFileInput = z.infer<typeof patientFileSchema>;

/** Registro tal como lo devuelve GET /api/patients/{id}/files */
export type PatientFile = {
  id: string; patientId: string; fileId: string; typeId: string; typeCode: string; typeName: string;
  title: string; description: string | null; takenAt: string | null; toothCode: string | null;
  originalName: string; mimeType: string; sizeBytes: number;
  createdAt: string; createdByName: string | null; updatedAt: string;
};
