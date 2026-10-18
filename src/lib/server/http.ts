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
  /** Tamaño máximo del cuerpo en bytes (por defecto 2 MB para JSON y 16 MB para multipart). */
  maxBody?: number;
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
  let originHost: string | null = null;
  try { originHost = origin ? new URL(origin).host : null; } catch { /* "null" u origen inválido */ }
  if (!originHost || !host || originHost !== host) throw new AppError('FORBIDDEN', 403, 'Origen no permitido.');
}

/** Rechaza cuerpos grandes ANTES de leerlos (evita agotar memoria con peticiones enormes). */
function checkBodySize(req: NextRequest, max?: number) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const multipart = (req.headers.get('content-type') ?? '').startsWith('multipart/form-data');
  const limit = max ?? (multipart ? 16 * 1024 * 1024 : 2 * 1024 * 1024);
  const len = req.headers.get('content-length');
  // Sin Content-Length (chunked) el middleware ya acota a 16 MB
  if (len !== null && (!/^\d+$/.test(len) || Number(len) > limit)) {
    throw new AppError('PAYLOAD_TOO_LARGE', 413, `La solicitud supera el tamaño permitido (${Math.round(limit / 1024 / 1024)} MB).`);
  }
}

/** Envoltura estándar de route handlers: auth, permisos, CSRF, rate limit, validación y errores. */
export function route<P = Record<string, string>>(opts: Opts, fn: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      checkOrigin(req);
      checkBodySize(req, opts.maxBody);
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
  // Sólo mensaje y pila: nunca el objeto completo (podría arrastrar datos de la petición)
  console.error('[api] error no controlado', err instanceof Error ? (err.stack ?? err.message) : String(err));
  // Nunca se exponen detalles internos al cliente
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado.' } }, { status: 500 });
}
