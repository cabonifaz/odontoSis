import { route, tenantOf } from '@/lib/server/http';
import { handleImportHistory, handleImportPost, IMPORT_MAX_BODY } from '@/lib/server/import/http';

/** Carga masiva de la clínica: sólo administrador (settings.manage) y sólo durante la implementación. */
export const GET = route({ platform: false, perm: 'settings.manage' }, async ({ user }) =>
  handleImportHistory(tenantOf(user), user.tenant!.access.phase));

/** multipart: file (.xlsx / .csv), entity, mode = validate | import. Además exige el permiso de escritura de cada entidad. */
export const POST = route({ platform: false, perm: 'settings.manage', limit: { key: 'import', max: 60, windowMs: 60_000 }, maxBody: IMPORT_MAX_BODY },
  async ({ req, user, ip }) =>
    handleImportPost(req, { tenantId: tenantOf(user), userId: user.userId, ip }, user.tenant!.access.phase, user.permissions));
