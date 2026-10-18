import { z } from 'zod';
import { route } from '@/lib/server/http';
import { tenantPhase } from '@/lib/server/services/bulk-import';
import { handleTemplate } from '@/lib/server/import/http';

const id = z.string().uuid();

export const GET = route<{ id: string; entity: string }>({ platform: true, limit: { key: 'import-tpl', max: 60, windowMs: 60_000 } },
  async ({ req, params }) => {
    const tenantId = id.parse(params.id);
    return handleTemplate(req, tenantId, params.entity, await tenantPhase(tenantId));
  });
