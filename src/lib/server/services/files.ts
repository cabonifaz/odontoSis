import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { callSp, spOne } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { sha256 } from '../crypto';
import { assertSaneImage } from '../image-guard';
import { can } from '@/lib/shared/types';

/**
 * Archivos en disco persistente (volumen de Railway montado en UPLOAD_DIR, p.ej. /data/uploads).
 * Nunca dentro del build: los despliegues no los borran.
 * Validación por "magic bytes" (no se confía en la extensión ni en el Content-Type).
 */
export type FileKind = 'LOGO' | 'INVOICE' | 'PAYMENT_PROOF' | 'CONTRACT' | 'REQUEST_ATTACHMENT';
// Logos: sólo imagen hasta 2 MB. Documentos de pago: imagen o PDF hasta 5 MB. Capturas de solicitudes: imagen hasta 8 MB.
const LIMITS: Record<FileKind, { maxBytes: number; pdf: boolean }> = {
  LOGO: { maxBytes: 2 * 1024 * 1024, pdf: false },
  INVOICE: { maxBytes: 5 * 1024 * 1024, pdf: true },
  PAYMENT_PROOF: { maxBytes: 5 * 1024 * 1024, pdf: true },
  CONTRACT: { maxBytes: 10 * 1024 * 1024, pdf: true },
  REQUEST_ATTACHMENT: { maxBytes: 8 * 1024 * 1024, pdf: false },
};
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
];

const root = () => resolve(env().UPLOAD_DIR);

export async function saveUpload(opts: { tenantId: string | null; actorId: string; ip: string | null; kind: FileKind; file: File }) {
  const limit = LIMITS[opts.kind];
  const mb = limit.maxBytes / 1024 / 1024;
  const invalid = () => new AppError('INVALID_FILE', 400, `Archivo no permitido. Usa ${limit.pdf ? 'PDF, ' : ''}PNG, JPG o WEBP de hasta ${mb} MB.`);
  if (opts.file.size > limit.maxBytes || opts.file.size === 0) throw invalid();
  const buf = Buffer.from(await opts.file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig || (sig.ext === 'pdf' && !limit.pdf)) throw invalid();
  assertSaneImage(buf, sig.mime);

  const id = randomUUID();
  // Documentos de pago: carpeta de plataforma (no son visibles para la clínica)
  const folder = opts.kind === 'LOGO' ? (opts.tenantId ?? 'platform')
    : opts.kind === 'REQUEST_ATTACHMENT' ? `${opts.tenantId}/requests`
    : opts.kind === 'CONTRACT' ? 'platform/contracts' : 'platform/payments';
  const storageKey = `${folder}/${id}.${sig.ext}`;
  await mkdir(join(root(), folder), { recursive: true });
  const full = join(root(), storageKey);
  await writeFile(full, buf, { mode: 0o640 });
  try {
    await callSp('sp_file_create', [opts.tenantId, opts.actorId, opts.ip, id, opts.kind, storageKey,
      opts.file.name.replace(/[^\w.\- ]/g, '_').slice(0, 255), sig.mime, buf.length, sha256(buf)]);
  } catch (err) {
    await unlink(full).catch(() => {}); // p. ej. PLAN_STORAGE_LIMIT: no dejar el binario huérfano en el volumen
    throw err;
  }
  return { id, mime: sig.mime };
}

/** Logo público de una clínica (para su pantalla de login). */
export async function readPublicLogo(code: string) {
  const f = await spOne<{ storage_key: string; mime_type: string; sha256: string }>('sp_tenant_public_logo', [code]);
  if (!f) throw new AppError('NOT_FOUND');
  const full = resolve(root(), f.storage_key);
  if (!full.startsWith(root() + sep)) throw new AppError('NOT_FOUND');
  return { data: await readFile(full), mime: f.mime_type, etag: f.sha256 };
}

export async function readUpload(id: string, tenantId: string | null, isPlatform: boolean, permissions: string[] = []) {
  const f = await spOne<{ storage_key: string; mime_type: string; sha256: string; original_name: string; kind: string }>('sp_file_get', [tenantId, isPlatform ? 1 : 0, id]);
  if (!f) throw new AppError('NOT_FOUND');
  // Imágenes clínicas: sólo quien puede ver pacientes (mismo 404 para no confirmar que existe)
  if (!isPlatform && f.kind === 'PATIENT_FILE' && !can(permissions, 'patients.read')) throw new AppError('NOT_FOUND');
  const full = resolve(root(), f.storage_key);
  if (!full.startsWith(root() + sep)) throw new AppError('NOT_FOUND'); // defensa ante path traversal
  return { data: await readFile(full), mime: f.mime_type, etag: f.sha256, name: f.original_name };
}
