import { route } from '@/lib/server/http';
import { dniLookupEnabled, lookupDni } from '@/lib/server/services/identity';

/** Datos personales por DNI (RENIEC) para evitar errores de digitación. Requiere sesión; con límite de uso. */
export const GET = route({ limit: { key: 'dni', max: 60, windowMs: 60_000 } }, async ({ req }) => {
  const n = req.nextUrl.searchParams.get('numero') ?? '';
  if (req.nextUrl.searchParams.get('check') === '1') return { enabled: dniLookupEnabled() };
  return lookupDni(n.trim());
});
