import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { spOne, callSp } from './db';
import { env, isProd } from './env';
import { randomToken, sha256 } from './crypto';
import { effectivePermissions, tenantAccess, type PermissionOverrides, type SessionUser } from '@/lib/shared/types';
import { parseDbDate, toDbDateTime, todayIn } from '@/lib/shared/format';

export const SESSION_COOKIE = () => (isProd() ? '__Host-odx_sid' : 'odx_sid');
const TOUCH_EVERY_MS = 5 * 60 * 1000;

type SessionRow = {
  session_id: string; expires_at: string; last_seen_at: string | null; mfa_verified: number;
  user_id: string; email: string; full_name: string; tenant_id: string | null; must_change_password: number;
  totp_enabled: number; role_code: string; role_name: string; permissions: string[] | string;
  permission_overrides: PermissionOverrides | string | null;
  tenant_name: string | null; tenant_code: string | null; primary_color: string | null; secondary_color: string | null;
  logo_file_id: string | null; timezone: string | null; tenant_status_code: string | null;
  currency_code: string | null; currency_symbol: string | null; budget_validity_days: number | null; doctor_id: string | null;
  subscription_start: string | null; subscription_end: string | null; implementation_start: string | null; implementation_end: string | null;
};

const ttlDate = () => new Date(Date.now() + env().SESSION_TTL_HOURS * 3600_000);
const toDb = toDbDateTime;

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? '').trim().slice(0, 64) || null;
  return { ip, userAgent: h.get('user-agent')?.slice(0, 300) ?? null };
}

/** Crea la sesión (token aleatorio; en BD sólo se guarda su SHA-256) y fija la cookie. */
export async function createSession(userId: string, mfaVerified: boolean) {
  const token = randomToken(32);
  const { ip, userAgent } = await clientInfo();
  await callSp('sp_session_create', [randomUUID(), userId, sha256(token), ip, userAgent, toDb(ttlDate()), mfaVerified ? 1 : 0]);
  (await cookies()).set(SESSION_COOKIE(), token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600, // la validez real la controla la BD (expiración deslizante)
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (token) await callSp('sp_session_revoke', [sha256(token), (await clientInfo()).ip]);
  jar.delete(SESSION_COOKIE());
}

/** Sesión actual (memoizada por request). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE())?.value;
  if (!token || token.length > 100) return null;
  const row = await spOne<SessionRow>('sp_session_get', [sha256(token)]);
  if (!row) return null;

  const lastSeen = row.last_seen_at ? parseDbDate(row.last_seen_at)!.getTime() : 0;
  if (Date.now() - lastSeen > TOUCH_EVERY_MS) {
    await callSp('sp_session_touch', [row.session_id, toDb(ttlDate())]);
  }

  const rolePerms = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
  const overrides = typeof row.permission_overrides === 'string' ? JSON.parse(row.permission_overrides) : row.permission_overrides;
  const permissions = effectivePermissions(rolePerms, overrides);
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    roleCode: row.role_code,
    roleName: row.role_name,
    permissions,
    isPlatform: row.tenant_id === null,
    mustChangePassword: !!row.must_change_password,
    totpEnabled: !!row.totp_enabled,
    mfaVerified: !!row.mfa_verified,
    doctorId: row.doctor_id,
    tenant: row.tenant_id
      ? {
          id: row.tenant_id,
          code: row.tenant_code!,
          name: row.tenant_name!,
          primaryColor: row.primary_color ?? '#0E7490',
          secondaryColor: row.secondary_color ?? '#F59E0B',
          logoFileId: row.logo_file_id,
          timezone: row.timezone ?? 'America/Lima',
          status: row.tenant_status_code ?? 'ACTIVE',
          currencyCode: row.currency_code ?? 'PEN',
          currencySymbol: row.currency_symbol ?? 'S/',
          budgetValidityDays: row.budget_validity_days ?? 15,
          access: tenantAccess({
            status: row.tenant_status_code ?? 'ACTIVE',
            subscriptionStart: row.subscription_start, subscriptionEnd: row.subscription_end,
            implementationStart: row.implementation_start, implementationEnd: row.implementation_end,
          }, todayIn(row.timezone ?? 'America/Lima')),
        }
      : null,
  };
});
