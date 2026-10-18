import { z } from 'zod';
import { route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { tenantPhase } from '@/lib/server/services/bulk-import';
import { handleImportHistory, handleImportPost, IMPORT_MAX_BODY } from '@/lib/server/import/http';

const id = z.string().uuid();

async function phaseOf(tenantId: string) {
  const phase = await tenantPhase(tenantId);
  if (phase === null) throw new AppError('NOT_FOUND');
  return phase;
}

/** Carga masiva hecha por el super admin para una clínica en implementación. */
export const GET = route<{ id: string }>({ platform: true }, async ({ params }) => {
  const tenantId = id.parse(params.id);
  return handleImportHistory(tenantId, await phaseOf(tenantId));
});

export const POST = route<{ id: string }>({ platform: true, limit: { key: 'import', max: 60, windowMs: 60_000 }, maxBody: IMPORT_MAX_BODY }, async ({ req, user, ip, params }) => {
  const tenantId = id.parse(params.id);
  return handleImportPost(req, { tenantId, userId: user.userId, ip }, await phaseOf(tenantId), user.permissions);
});
