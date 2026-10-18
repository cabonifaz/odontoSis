import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { callSp, spOne } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { sha256 } from '../crypto';

/**
 * Archivos en disco persistente (volumen de Railway montado en UPLOAD_DIR, p.ej. /data/uploads).
 * Nunca dentro del build: los despliegues no los borran.
 * Validación por "magic bytes" (no se confía en la extensión ni en el Content-Type).
 */
export type FileKind = 'LOGO' | 'INVOICE' | 'PAYMENT_PROOF' | 'CONTRACT';
// Logos: sólo imagen hasta 2 MB. Documentos de pago: imagen o PDF hasta 5 MB.
const LIMITS: Record<FileKind, { maxBytes: number; pdf: boolean }> = {
  LOGO: { maxBytes: 2 * 1024 * 1024, pdf: false },
  INVOICE: { maxBytes: 5 * 1024 * 1024, pdf: true },
  PAYMENT_PROOF: { maxBytes: 5 * 1024 * 1024, pdf: true },
  CONTRACT: { maxBytes: 10 * 1024 * 1024, pdf: true },
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
  const invalid = () => new AppError('INVALID_FILE', 400, limit.pdf ? `Archivo no permitido. Usa PDF, PNG, JPG o WEBP de hasta ${limit.maxBytes / 1024 / 1024} MB.` : undefined);
  if (opts.file.size > limit.maxBytes || opts.file.size === 0) throw invalid();
  const buf = Buffer.from(await opts.file.arrayBuffer());
  const sig = SIGNATURES.find((s) => s.test(buf));
  if (!sig || (sig.ext === 'pdf' && !limit.pdf)) throw invalid();

  const id = randomUUID();
  // Documentos de pago: carpeta de plataforma (no son visibles para la clínica)
  const folder = opts.kind === 'LOGO' ? (opts.tenantId ?? 'platform') : opts.kind === 'CONTRACT' ? 'platform/contracts' : 'platform/payments';
  const storageKey = `${folder}/${id}.${sig.ext}`;
  await mkdir(join(root(), folder), { recursive: true });
  await writeFile(join(root(), storageKey), buf, { mode: 0o640 });
  await callSp('sp_file_create', [opts.tenantId, opts.actorId, opts.ip, id, opts.kind, storageKey,
    opts.file.name.replace(/[^\w.\- ]/g, '_'), sig.mime, buf.length, sha256(buf)]);
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

export async function readUpload(id: string, tenantId: string | null, isPlatform: boolean) {
  const f = await spOne<{ storage_key: string; mime_type: string; sha256: string; original_name: string }>('sp_file_get', [tenantId, isPlatform ? 1 : 0, id]);
  if (!f) throw new AppError('NOT_FOUND');
  const full = resolve(root(), f.storage_key);
  if (!full.startsWith(root() + sep)) throw new AppError('NOT_FOUND'); // defensa ante path traversal
  return { data: await readFile(full), mime: f.mime_type, etag: f.sha256, name: f.original_name };
}
