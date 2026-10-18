import 'server-only';
import { callSp, spOne } from '../db';
import { env } from '../env';
import { AppError } from '../errors';
import { burnPasswordTime, hashPassword, passwordPolicyErrors, verifyPassword } from '../password';
import { createSession, clientInfo } from '../session';
import { decrypt, encrypt } from '../crypto';
import { generateTotpSecret, totpUri, verifyTotp } from '../totp';
import type { SessionUser } from '@/lib/shared/types';
import { parseDbDate } from '@/lib/shared/format';

type AuthRow = {
  id: string; tenant_id: string | null; email: string; password_hash: string; is_active: number;
  locked_until: string | null; totp_enabled: number; role_code: string; tenant_code: string | null; tenant_status_code: string | null;
  tenant_deleted_at: string | null;
};

/** Inicio de sesión con bloqueo por intentos, sin revelar si la cuenta existe. */
export async function login(email: string, password: string, tenantCode?: string) {
  const { ip } = await clientInfo();
  const e = env();
  const user = await spOne<AuthRow>('sp_auth_user_get_by_email', [email]);

  if (!user) {
    await burnPasswordTime(password);
    await callSp('sp_auth_login_failed', [null, email, e.LOGIN_MAX_ATTEMPTS, e.LOGIN_LOCK_MINUTES, ip, 'UNKNOWN_USER']);
    throw new AppError('INVALID_CREDENTIALS');
  }
  if (user.locked_until && parseDbDate(user.locked_until)!.getTime() > Date.now()) {
    await callSp('sp_auth_login_failed', [null, email, e.LOGIN_MAX_ATTEMPTS, e.LOGIN_LOCK_MINUTES, ip, 'LOCKED']);
    throw new AppError('ACCOUNT_LOCKED');
  }
  const ok = await verifyPassword(user.password_hash, password);
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

export async function verifyMfa(s: SessionUser, code: string) {
  const sec = await spOne<{ totp_secret_enc: string | null }>('sp_user_security_get', [s.userId]);
  const secret = decrypt(sec?.totp_secret_enc);
  if (!secret || !verifyTotp(secret, code)) throw new AppError('INVALID_MFA');
  await callSp('sp_session_set_mfa', [s.sessionId, (await clientInfo()).ip]);
}

export async function changePassword(s: SessionUser, current: string, next: string) {
  const errors = passwordPolicyErrors(next);
  if (errors.length) throw new AppError('WEAK_PASSWORD', 400, `La contraseña requiere: ${errors.join(', ')}.`);
  const sec = await spOne<{ password_hash: string }>('sp_user_security_get', [s.userId]);
  if (!sec || !(await verifyPassword(sec.password_hash, current))) throw new AppError('INVALID_CREDENTIALS', 400, 'La contraseña actual no es correcta.');
  if (current === next) throw new AppError('WEAK_PASSWORD', 400, 'La nueva contraseña debe ser distinta a la actual.');
  const { ip } = await clientInfo();
  await callSp('sp_user_password_set', [s.userId, await hashPassword(next), 0, s.userId, ip]);
  // Cierra las demás sesiones del usuario
  await callSp('sp_session_revoke_user', [s.userId, s.sessionId, s.userId]);
}

/** Paso 1 del alta de 2FA: genera secreto (cifrado en BD, aún no activo). */
export async function startTotpSetup(s: SessionUser) {
  if (s.totpEnabled) throw new AppError('VALIDATION', 400, 'El doble factor ya está activo.');
  const secret = generateTotpSecret();
  await callSp('sp_user_totp_set', [s.userId, encrypt(secret), 0, s.userId, (await clientInfo()).ip]);
  return { secret, uri: totpUri(secret, s.email) };
}

/** Paso 2: confirma con un código válido y activa. */
export async function confirmTotpSetup(s: SessionUser, code: string) {
  const sec = await spOne<{ totp_secret_enc: string | null }>('sp_user_security_get', [s.userId]);
  const secret = decrypt(sec?.totp_secret_enc);
  if (!secret || !verifyTotp(secret, code)) throw new AppError('INVALID_MFA');
  const { ip } = await clientInfo();
  await callSp('sp_user_totp_set', [s.userId, sec!.totp_secret_enc, 1, s.userId, ip]);
  await callSp('sp_session_set_mfa', [s.sessionId, ip]);
}
