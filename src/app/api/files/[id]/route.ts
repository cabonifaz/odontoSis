import { z } from 'zod';
import { route } from '@/lib/server/http';
import { readUpload } from '@/lib/server/services/files';

export const GET = route<{ id: string }>({}, async ({ req, user, params }) => {
  const id = z.string().uuid().parse(params.id);
  const f = await readUpload(id, user.tenant?.id ?? null, user.isPlatform, user.permissions);
  const download = req.nextUrl.searchParams.get('download') === '1';
  const filename = encodeURIComponent(f.name || `archivo-${id}`);
  return new Response(new Uint8Array(f.data), {
    headers: {
      'Content-Type': f.mime,
      'Cache-Control': 'private, max-age=86400',
      ETag: `"${f.etag}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${filename}`,
    },
  });
});
