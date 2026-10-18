import 'server-only';
import { redirect } from 'next/navigation';
import { getSession } from './session';
import { AppError } from './errors';
import { can, type SessionUser } from '@/lib/shared/types';

/** Motivo por el que una sesión válida aún no puede operar (o null si puede). */
function pendingStep(s: SessionUser): string | null {
  if (s.totpEnabled && !s.mfaVerified) return '/mfa';
  if (s.mustChangePassword) return '/change-password';
  // El super admin debe tener 2FA activo en todos los ambientes
  if (s.isPlatform && !s.totpEnabled) return '/account/security?required=1';
  // Sin implementación vigente ni contrato vigente, la clínica no puede trabajar
  if (s.tenant && s.tenant.access.phase === 'BLOCKED') return '/suspended';
  return null;
}

type GuardOpts = {
  platform?: boolean;
  perm?: string | string[];
  /** Permite sesiones con pasos pendientes (cambio de contraseña, alta 2FA, clínica suspendida) */
  allowPending?: boolean;
  /** Permite sesiones que aún no verificaron el 2FA (sólo la pantalla/endpoint de verificación) */
  allowMfaPending?: boolean;
};

function check(s: SessionUser, opts: GuardOpts): string | null {
  const step = pendingStep(s);
  if (step === '/mfa' && !opts.allowMfaPending) return step;
  if (step && step !== '/mfa' && !opts.allowPending) return step;
  return null;
}

/** Para páginas (server components). Redirige si no hay sesión o falta un paso. */
export async function requirePageSession(opts: GuardOpts = {}) {
  const s = await getSession();
  if (!s) redirect('/login');
  const step = check(s, opts);
  if (step) redirect(step);
  if (opts.platform === true && !s.isPlatform) redirect('/app');
  if (opts.platform === false && s.isPlatform) redirect('/admin');
  const perms = Array.isArray(opts.perm) ? opts.perm : opts.perm ? [opts.perm] : [];
  if (perms.some((p) => !can(s.permissions, p))) redirect(s.isPlatform ? '/admin' : '/app');
  return s;
}

/** Para API routes. Lanza AppError en vez de redirigir. */
export async function requireApiSession(opts: GuardOpts = {}) {
  const s = await getSession();
  if (!s) throw new AppError('UNAUTHORIZED');
  if (check(s, opts)) throw new AppError('FORBIDDEN', 403, 'Completa la verificación de tu cuenta.');
  if (opts.platform === true && !s.isPlatform) throw new AppError('FORBIDDEN');
  if (opts.platform === false && (s.isPlatform || !s.tenant)) throw new AppError('FORBIDDEN');
  const perms = Array.isArray(opts.perm) ? opts.perm : opts.perm ? [opts.perm] : [];
  if (perms.some((p) => !can(s.permissions, p))) throw new AppError('FORBIDDEN');
  return s;
}

export const homeFor = (s: SessionUser) => pendingStep(s) ?? (s.isPlatform ? '/admin' : '/app');
