import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z, ZodError } from 'zod';
import { AppError } from './errors';
import { requireApiSession } from './guard';
import { clientInfo } from './session';
import { rateLimit } from './rate-limit';
import type { SessionUser } from '@/lib/shared/types';

type Opts = {
  /** true = sólo super admin; false = sólo usuarios de clínica; undefined = cualquiera autenticado */
  platform?: boolean;
  perm?: string | string[];
  public?: boolean;
  allowPending?: boolean;
  allowMfaPending?: boolean;
  limit?: { key: string; max: number; windowMs: number };
};

type Ctx<P> = {
  req: NextRequest;
  user: SessionUser;
  ip: string | null;
  params: P;
  body: <S extends z.ZodType>(schema: S) => Promise<z.infer<S>>;
};

/** Contexto de tenant garantizado para handlers de clínica. */
export const tenantOf = (u: SessionUser) => {
  if (!u.tenant) throw new AppError('FORBIDDEN');
  return u.tenant.id;
};

/** Verifica Origin en peticiones que modifican estado (defensa CSRF además de SameSite=Lax). */
function checkOrigin(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) throw new AppError('FORBIDDEN', 403, 'Origen no permitido.');
}

/** Envoltura estándar de route handlers: auth, permisos, CSRF, rate limit, validación y errores. */
export function route<P = Record<string, string>>(opts: Opts, fn: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      checkOrigin(req);
      const { ip } = await clientInfo();
      if (opts.limit) rateLimit(`${opts.limit.key}:${ip}`, opts.limit.max, opts.limit.windowMs);
      const user = opts.public ? (null as unknown as SessionUser) : await requireApiSession(opts);
      const params = (await context?.params) ?? ({} as P);
      const body = async <S extends z.ZodType>(schema: S) => schema.parse(await req.json().catch(() => ({})));
      const result = await fn({ req, user, ip, params, body });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Revisa los datos ingresados.', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } },
      { status: 400 },
    );
  }
  console.error('[api] error no controlado', err);
  // Nunca se exponen detalles internos al cliente
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado.' } }, { status: 500 });
}
