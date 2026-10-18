import 'server-only';
import { callSp, spOne, spRows, type Row } from '../db';
import { decrypt } from '../crypto';
import type { OrthoBudgetInput } from '@/lib/shared/ortho-schemas';

export type Ctx = { tenantId: string; userId: string; ip: string | null };
const base = (c: Ctx) => [c.tenantId, c.userId, c.ip] as const;

// ---------------- Presupuestos de ortodoncia ----------------
export const listOrthoBudgets = (tenantId: string, patientId: string | null) =>
  spRows('sp_ortho_budget_list', [tenantId, patientId]);

/** Cabecera + cronograma de cuotas (calculado en el SP). */
export async function getOrthoBudget(tenantId: string, id: string) {
  const [head, schedule] = await callSp('sp_ortho_budget_get', [tenantId, id]);
  const h = head?.[0] as Row | undefined;
  if (!h) return null;
  const { doc_number_enc, guardian_doc_number_enc, ...rest } = h;
  return { ...rest, doc_number: decrypt(doc_number_enc), guardian_doc_number: decrypt(guardian_doc_number_enc), schedule: schedule ?? [] };
}

/** canEdit: el usuario puede modificar presupuestos ya emitidos (budgets.edit). El SP lo valida. */
export const saveOrthoBudget = (c: Ctx, b: OrthoBudgetInput, canEdit: boolean) =>
  spOne('sp_ortho_budget_save', [...base(c), b.id, b.patientId, b.doctorId, b.branchId, b.budgetDate, b.statusCode,
    b.applianceId, b.diagnosis, b.treatmentPlan, b.estimatedMonths, b.totalAmount, b.initialPayment, b.installments,
    b.includesRetainers, b.retainerAmount, b.agreementId, b.notes, canEdit]);

export const deleteOrthoBudget = (c: Ctx, id: string) => callSp('sp_ortho_budget_delete', [...base(c), id]);
