import 'server-only';
import { callSp, spOne } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { burnPasswordTime, hashPassword, passwordPolicyErrors, verifyPassword } from '../password';
import { createSession, clientInfo, rotateSession } from '../session';
import { semaphore } from '../rate-limit';
import { decrypt, encrypt } from '../crypto';
import { generateTotpSecret, totpUri, verifyTotp } from '../totp';
import type { SessionUser } from '@/lib/shared/types';
import { parseDbDate } from '@/lib/shared/format';

type AuthRow = {
  id: string; tenant_id: string | null; email: string; password_hash: string; is_active: number;
  locked_until: string | null; totp_enabled: number; role_code: string; tenant_code: string | null; tenant_status_code: string | null;
  tenant_deleted_at: string | null;
};

const MFA_MAX_ATTEMPTS = 5;
/** argon2 es caro (CPU + 19 MiB): como máximo 4 en paralelo y 50 en cola; el resto recibe 429. */
const heavy = semaphore(4, 50);
const checkPassword = (hash: string, plain: string) => heavy(() => verifyPassword(hash, plain));
const decoyHash = (plain: string) => heavy(() => burnPasswordTime(plain));

/** Inicio de sesión con bloqueo por intentos, sin revelar si la cuenta existe (ni si está bloqueada). */
export async function login(email: string, password: string, tenantCode?: string) {
  const { ip } = await clientInfo();
  const e = env();
  const user = await spOne<AuthRow>('sp_auth_user_get_by_email', [email]);

  if (!user) {
    await decoyHash(password);
    await callSp('sp_auth_login_failed', [null, email, e.LOGIN_MAX_ATTEMPTS, e.LOGIN_LOCK_MINUTES, ip, 'UNKNOWN_USER']);
    throw new AppError('INVALID_CREDENTIALS');
  }
  if (user.locked_until && parseDbDate(user.locked_until)!.getTime() > Date.now()) {
    // Misma respuesta y mismo costo que una clave errónea: no se revela que la cuenta existe
    await decoyHash(password);
    await callSp('sp_auth_login_failed', [null, email, e.LOGIN_MAX_ATTEMPTS, e.LOGIN_LOCK_MINUTES, ip, 'LOCKED']);
    throw new AppError('INVALID_CREDENTIALS');
  }
  const ok = await checkPassword(user.password_hash, password);
  if (!ok || !user.is_active) {
    await callSp('sp_auth_login_failed', [user.id, email, e.LOGIN_MAX_ATTEMPTS, e.LOGIN_LOCK_MINUTES, ip, ok ? 'INACTIVE' : 'BAD_PASSWORD']);
    throw new AppError('INVALID_CREDENTIALS');
  }
  // Desde el link de una clínica sólo ingresan usuarios de esa clínica (mismo mensaje genérico)
  if (tenantCode && user.tenant_code !== tenantCode) {
    await callSp('sp_auth_login_failed', [user.id, email, e.LOGIN_MAX_ATTEMPTS, e.LOGIN_LOCK_MINUTES, ip, 'WRONG_TENANT']);
    throw new AppError('INVALID_CREDENTIALS');
  }
  if (user.tenant_id && (user.tenant_deleted_at || user.tenant_status_code === 'CANCELLED')) {
    throw new AppError('TENANT_INACTIVE');
  }
  await callSp('sp_auth_login_succeeded', [user.id, ip]);
  await createSession(user.id, !user.totp_enabled);
  return { mfaRequired: !!user.totp_enabled };
}

/**
 * Valida un código TOTP del usuario: rechaza códigos repetidos y cuenta fallos en BD
 * (al 5.º fallo se bloquea la cuenta y se cierran todas sus sesiones). Devuelve true si es válido.
 */
async function checkTotp(userId: string, code: string): Promise<boolean> {
  const sec = await spOne<{ totp_secret_enc: string | null }>('sp_user_security_get', [userId]);
  const secret = decrypt(sec?.totp_secret_enc);
  const step = secret ? verifyTotp(secret, code) : null;
  if (step !== null) {
    try { await callSp('sp_auth_mfa_succeeded', [userId, step]); return true; } catch { /* código ya usado */ }
  }
  const e = env();
  const r = await spOne<{ locked: number }>('sp_auth_mfa_failed', [userId, MFA_MAX_ATTEMPTS, e.LOGIN_LOCK_MINUTES, (await clientInfo()).ip]);
  if (r?.locked) throw new AppError('UNAUTHORIZED', 401, 'Demasiados códigos incorrectos. Por seguridad se cerró la sesión; vuelve a intentarlo más tarde.');
  return false;
}

export async function verifyMfa(s: SessionUser, code: string) {
  if (!(await checkTotp(s.userId, code))) throw new AppError('INVALID_MFA');
  await callSp('sp_session_set_mfa', [s.sessionId, (await clientInfo()).ip]);
  await rotateSession(s.userId); // token nuevo tras elevar privilegios
}

export async function changePassword(s: SessionUser, current: string, next: string) {
  const errors = passwordPolicyErrors(next);
  if (errors.length) throw new AppError('WEAK_PASSWORD', 400, `La contraseña requiere: ${errors.join(', ')}.`);
  const sec = await spOne<{ password_hash: string }>('sp_user_security_get', [s.userId]);
  if (!sec || !(await checkPassword(sec.password_hash, current))) throw new AppError('INVALID_CREDENTIALS', 400, 'La contraseña actual no es correcta.');
  if (current === next) throw new AppError('WEAK_PASSWORD', 400, 'La nueva contraseña debe ser distinta a la actual.');
  const { ip } = await clientInfo();
  await callSp('sp_user_password_set', [s.userId, await heavy(() => hashPassword(next)), 0, s.userId, ip]);
  // Cierra las demás sesiones del usuario
  await callSp('sp_session_revoke_user', [s.userId, s.sessionId, s.userId]);
}

/** Paso 1 del alta de 2FA: exige la contraseña actual (una sesión robada no puede enrolar otro autenticador). */
export async function startTotpSetup(s: SessionUser, password: string) {
  if (s.totpEnabled) throw new AppError('VALIDATION', 400, 'El doble factor ya está activo.');
  const sec = await spOne<{ password_hash: string }>('sp_user_security_get', [s.userId]);
  if (!sec || !(await checkPassword(sec.password_hash, password))) throw new AppError('INVALID_CREDENTIALS', 400, 'La contraseña no es correcta.');
  const secret = generateTotpSecret();
  await callSp('sp_user_totp_set', [s.userId, encrypt(secret), 0, s.userId, (await clientInfo()).ip]);
  return { secret, uri: totpUri(secret, s.email) };
}

/** Paso 2: confirma con un código válido y activa. */
export async function confirmTotpSetup(s: SessionUser, code: string) {
  const sec = await spOne<{ totp_secret_enc: string | null }>('sp_user_security_get', [s.userId]);
  const secret = decrypt(sec?.totp_secret_enc);
  const step = secret ? verifyTotp(secret, code) : null;
  if (step === null) throw new AppError('INVALID_MFA');
  const { ip } = await clientInfo();
  await callSp('sp_user_totp_set', [s.userId, sec!.totp_secret_enc, 1, s.userId, ip]);
  await callSp('sp_auth_mfa_succeeded', [s.userId, step]);
  await callSp('sp_session_set_mfa', [s.sessionId, ip]);
  // Al activar el 2FA se cierran las demás sesiones (por si alguna estaba comprometida) y se rota el token
  await callSp('sp_session_revoke_user', [s.userId, s.sessionId, s.userId]);
  await rotateSession(s.userId);
}

/** Restablece el 2FA de otro usuario: admin de su clínica (tenantId) o super admin (tenantId null). */
export const resetUserMfa = async (actor: { userId: string; ip: string | null }, tenantId: string | null, userId: string) =>
  callSp('sp_user_totp_reset', [tenantId, actor.userId, actor.ip, userId]);
