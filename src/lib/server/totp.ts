import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** TOTP (RFC 6238) compatible con Google Authenticator / Microsoft Authenticator. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error('base32 inválido');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/** Verifica con tolerancia de ±1 intervalo de 30 s. */
export function verifyTotp(secretB32: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(Date.now() / 30_000);
  for (const w of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(secret, counter + w));
    if (timingSafeEqual(expected, Buffer.from(token))) return true;
  }
  return false;
}

export function totpUri(secret: string, account: string, issuer = 'OdontoSis') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
