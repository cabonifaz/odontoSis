import { z } from 'zod';
import { route } from '@/lib/server/http';
import { readPublicLogo } from '@/lib/server/services/files';

/** Logo de la clínica para su pantalla de login (público: sólo expone el logo). */
export const GET = route<{ code: string }>({ public: true, limit: { key: 'logo', max: 120, windowMs: 60_000 } }, async ({ params }) => {
  const code = z.string().regex(/^[a-z0-9_-]{1,40}$/).parse(params.code.toLowerCase());
  const f = await readPublicLogo(code);
  return new Response(new Uint8Array(f.data), {
    headers: { 'Content-Type': f.mime, 'Cache-Control': 'public, max-age=3600', ETag: `"${f.etag}"`, 'X-Content-Type-Options': 'nosniff' },
  });
});
