import { route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { masterItemSchema } from '@/lib/shared/schemas';
import { listMasterItems, listMasterTables, saveMasterItem } from '@/lib/server/services/clinic';
import { can } from '@/lib/shared/types';

/** Catálogos: super admin gestiona los globales; la clínica, sus ítems propios en tablas editables. */
export const GET = route({}, async ({ req, user }) => {
  const table = req.nextUrl.searchParams.get('table');
  if (req.nextUrl.searchParams.get('tables') === '1') return listMasterTables();
  return listMasterItems(user.tenant?.id ?? null, table ? table.slice(0, 60) : null, req.nextUrl.searchParams.get('all') === '1');
});

export const POST = route({}, async ({ user, ip, body }) => {
  if (!user.isPlatform && !can(user.permissions, 'catalogs.manage')) throw new AppError('FORBIDDEN');
  const m = await body(masterItemSchema);
  await saveMasterItem(user.tenant?.id ?? null, { userId: user.userId, ip }, m);
  return { id: m.id };
});
