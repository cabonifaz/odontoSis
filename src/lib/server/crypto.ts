import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from './env';

/**
 * Cifrado de datos sensibles en reposo: AES-256-GCM (autenticado).
 * Formato: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 * El prefijo de versión permite rotar la clave en el futuro.
 */
const VERSION = 'v1';

const key = () => Buffer.from(env().DATA_ENCRYPTION_KEY, 'base64');

export function encrypt(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(payload: unknown): string | null {
  if (typeof payload !== 'string' || payload === '') return null;
  const [version, iv, tag, ct] = payload.split('.');
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Formato de dato cifrado inválido');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

/** Blind index: permite buscar por igualdad sobre un dato cifrado sin descifrar. */
export function blindIndex(value: string | null | undefined): string | null {
  const norm = value?.replace(/[\s.-]/g, '').toUpperCase();
  if (!norm) return null;
  return createHmac('sha256', Buffer.from(env().BLIND_INDEX_KEY, 'base64')).update(norm).digest('hex');
}

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
