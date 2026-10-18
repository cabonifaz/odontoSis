import { route, tenantOf } from '@/lib/server/http';
import { handleTemplate } from '@/lib/server/import/http';

/** Plantilla de carga masiva (?format=csv para CSV de ejemplo). */
export const GET = route<{ entity: string }>({ platform: false, perm: 'settings.manage', limit: { key: 'import-tpl', max: 60, windowMs: 60_000 } },
  async ({ req, user, params }) => handleTemplate(req, tenantOf(user), params.entity, user.tenant!.access.phase));
