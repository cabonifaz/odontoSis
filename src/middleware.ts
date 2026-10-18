import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cabeceras de seguridad + CSP con nonce por request.
 * La validación real de sesión ocurre en el servidor (layouts y API) contra la BD.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    dev ? '' : 'upgrade-insecure-requests',
  ].filter(Boolean).join('; ');

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('Content-Security-Policy', csp);

  // Redirección temprana si no hay cookie de sesión (la BD decide si es válida)
  const { pathname } = req.nextUrl;
  const hasCookie = req.cookies.has('__Host-odx_sid') || req.cookies.has('odx_sid');
  const res = !hasCookie && (pathname.startsWith('/app') || pathname.startsWith('/admin'))
    ? NextResponse.redirect(new URL('/login', req.url))
    : NextResponse.next({ request: { headers: reqHeaders } });

  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (!dev) res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  return res;
}

export const config = {
  matcher: [
    // Todo excepto estáticos de Next, service worker y archivos públicos
    { source: '/((?!_next/static|_next/image|sw.js|swe-worker|manifest.webmanifest|icons/|favicon.ico).*)' },
  ],
};
