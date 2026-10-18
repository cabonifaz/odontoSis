import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { callSp, spRows } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { sha256 } from '../crypto';
import { PATIENT_FILE_MAX_BYTES, type PatientFile, type PatientFileInput } from '@/lib/shared/patient-file-schemas';
import type { Ctx } from './clinic';

/**
 * Imágenes y archivos del paciente (radiografías, fotos clínicas, consentimientos, laboratorio).
 * El binario se guarda en el volumen persistente: ${UPLOAD_DIR}/<tenantId>/patients/<patientId>/<uuid>.<ext>
 * y se registra en file_asset con kind 'PATIENT_FILE' (sp_file_create aplica la cuota del plan).
 * Sólo se sirve por /api/files/{id}, que verifica el tenant.
 */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalidFile = () => new AppError('INVALID_FILE', 400, 'Archivo no permitido. Usa JPG, PNG, WEBP o PDF de hasta 15 MB.');
const root = () => resolve(env().UPLOAD_DIR);

/** Detecta el tipo real por magic bytes (null si no es JPG/PNG/WEBP/PDF). */
export const detectPatientFileType = (buf: Buffer) => SIGNATURES.find((s) => s.test(buf)) ?? null;

/** Valida, escribe en disco y registra el archivo (todavía sin vincularlo a la ficha del paciente). */
export async function savePatientUpload(c: Ctx, patientId: string, file: File) {
  if (!UUID.test(c.tenantId) || !UUID.test(patientId)) throw new AppError('NOT_FOUND');
  if (file.size === 0 || file.size > PATIENT_FILE_MAX_BYTES) throw invalidFile();
  const buf = Buffer.from(await file.arrayBuffer());
  const sig = detectPatientFileType(buf);
  if (!sig) throw invalidFile();

  const id = randomUUID();
  const folder = `${c.tenantId}/patients/${patientId}`;
  const storageKey = `${folder}/${id}.${sig.ext}`;
  const full = resolve(root(), storageKey);
  if (!full.startsWith(root() + sep)) throw new AppError('NOT_FOUND'); // defensa ante path traversal
  await mkdir(join(root(), folder), { recursive: true });
  await writeFile(full, buf, { mode: 0o640 });
  const name = file.name.replace(/[^\w.\- ]/g, '_').slice(0, 255) || `archivo.${sig.ext}`;
  try {
    await callSp('sp_file_create', [c.tenantId, c.userId, c.ip, id, 'PATIENT_FILE', storageKey, name, sig.mime, buf.length, sha256(buf)]);
  } catch (err) {
    await unlink(full).catch(() => {}); // p. ej. PLAN_STORAGE_LIMIT: no dejar el binario huérfano
    throw err;
  }
  return { id, mime: sig.mime, name, size: buf.length };
}

/** Marca como eliminado un archivo subido que no llegó a vincularse a la ficha. */
export const discardPatientUpload = (c: Ctx, fileId: string) =>
  callSp('sp_patient_file_asset_discard', [c.tenantId, c.userId, c.ip, fileId]);

export async function listPatientFiles(tenantId: string, patientId: string): Promise<PatientFile[]> {
  const rows = await spRows('sp_patient_file_list', [tenantId, patientId]);
  return rows.map((r) => ({
    id: r.id as string, patientId: r.patient_id as string, fileId: r.file_id as string, typeId: r.type_id as string,
    typeCode: r.type_code as string, typeName: r.type_name as string, title: r.title as string,
    description: (r.description as string | null) ?? null, takenAt: (r.taken_at as string | null) ?? null,
    toothCode: (r.tooth_code as string | null) ?? null, originalName: r.original_name as string,
    mimeType: r.mime_type as string, sizeBytes: Number(r.size_bytes), createdAt: r.created_at as string,
    createdByName: (r.created_by_name as string | null) ?? null, updatedAt: r.updated_at as string,
  }));
}

export const savePatientFile = (c: Ctx, patientId: string, f: PatientFileInput) =>
  callSp('sp_patient_file_save', [c.tenantId, c.userId, c.ip, f.id, patientId, f.fileId, f.typeId, f.title,
    f.description, f.takenAt, f.toothCode]);

export const deletePatientFile = (c: Ctx, patientId: string, id: string) =>
  callSp('sp_patient_file_delete', [c.tenantId, c.userId, c.ip, patientId, id]);

/** Sube el archivo y lo vincula a la ficha en un solo paso (si falla el registro, se descarta el archivo). */
export async function uploadAndSavePatientFile(c: Ctx, patientId: string, file: File, meta: Omit<PatientFileInput, 'id' | 'fileId'>) {
  const up = await savePatientUpload(c, patientId, file);
  const recordId = randomUUID();
  try {
    await savePatientFile(c, patientId, { ...meta, id: recordId, fileId: up.id });
  } catch (err) {
    await discardPatientUpload(c, up.id).catch(() => {});
    throw err;
  }
  const record = (await listPatientFiles(c.tenantId, patientId)).find((r) => r.id === recordId) ?? null;
  return { ...up, record };
}
