import { route, tenantOf } from '@/lib/server/http';
import { listOrthoBudgets, saveOrthoBudget } from '@/lib/server/services/ortho';
import { orthoBudgetSchema } from '@/lib/shared/ortho-schemas';
import { can } from '@/lib/shared/types';

/** GET /api/ortho-budgets?patientId= -> filas de sp_ortho_budget_list */
export const GET = route({ platform: false, perm: 'budgets.read' }, async ({ req, user }) => {
  const patientId = req.nextUrl.searchParams.get('patientId');
  return listOrthoBudgets(tenantOf(user), patientId && /^[0-9a-f-]{36}$/i.test(patientId) ? patientId : null);
});

/** POST /api/ortho-budgets -> crea (budgets.write) o modifica (además budgets.edit, validado por el SP) */
export const POST = route({ platform: false, perm: 'budgets.write' }, async ({ user, ip, body }) => {
  const data = await body(orthoBudgetSchema);
  return saveOrthoBudget({ tenantId: tenantOf(user), userId: user.userId, ip }, data, can(user.permissions, 'budgets.edit'));
});
