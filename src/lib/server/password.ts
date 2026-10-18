import 'server-only';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

// Parámetros argon2id recomendados por OWASP (m=19 MiB, t=2, p=1)
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, OPTS);

export async function verifyPassword(hashValue: string, plain: string) {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}

// Hash señuelo para igualar tiempos cuando el usuario no existe (evita enumeración de cuentas)
let dummy: Promise<string> | null = null;
export async function burnPasswordTime(plain: string) {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(await dummy, plain);
}

/** Política: mínimo 10 caracteres con mayúscula, minúscula, número y símbolo. */
export function passwordPolicyErrors(pw: string): string[] {
  const errors: string[] = [];
  if (pw.length < 10) errors.push('Mínimo 10 caracteres');
  if (pw.length > 128) errors.push('Máximo 128 caracteres');
  if (!/[a-z]/.test(pw)) errors.push('Una letra minúscula');
  if (!/[A-Z]/.test(pw)) errors.push('Una letra mayúscula');
  if (!/[0-9]/.test(pw)) errors.push('Un número');
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push('Un símbolo');
  return errors;
}

/** Contraseña temporal fuerte (se fuerza el cambio en el primer ingreso). */
export function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${out}#7`;
}
