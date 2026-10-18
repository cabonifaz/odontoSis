import { z } from 'zod';

const uuid = z.string().uuid();
const optUuid = z.string().uuid().nullish().or(z.literal('').transform(() => null));
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const money = z.coerce.number().min(0, 'No puede ser negativo').max(9_999_999);

export const ORTHO_MAX_INSTALLMENTS = 120;

/** Presupuesto de ortodoncia. Los montos derivados (descuento, cuotas) los calcula el SP. */
export const orthoBudgetSchema = z.object({
  id: uuid,
  patientId: uuid,
  doctorId: optUuid,
  /** Sede; vacío = sede principal */
  branchId: optUuid,
  budgetDate: date,
  statusCode: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED']).default('DRAFT'),
  applianceId: uuid,
  diagnosis: optText(4000),
  treatmentPlan: optText(4000),
  estimatedMonths: z.coerce.number().int('Ingresa meses enteros').min(1, 'Mínimo 1 mes').max(120, 'Máximo 120 meses'),
  totalAmount: money,
  initialPayment: money.default(0),
  installments: z.coerce.number().int('Ingresa un número entero').min(1, 'Mínimo 1 cuota').max(ORTHO_MAX_INSTALLMENTS, `Máximo ${ORTHO_MAX_INSTALLMENTS} cuotas`),
  includesRetainers: z.boolean().default(false),
  retainerAmount: money.default(0),
  agreementId: optUuid,
  notes: optText(2000),
});

export type OrthoBudgetInput = z.infer<typeof orthoBudgetSchema>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type OrthoPlan = {
  total: number; discount: number; net: number; initial: number; installments: number;
  installmentAmount: number; lastInstallmentAmount: number; retainer: number; grandTotal: number;
  initialExceeds: boolean;
};

/**
 * Vista previa del plan de pagos (mismo cálculo que sp_ortho_budget_save; el servidor es la fuente de verdad):
 * descuento = ROUND(total * % / 100, 2); cuota = ROUND((neto - inicial) / N, 2); la última absorbe el redondeo.
 */
export function orthoPlan(i: { totalAmount: number; initialPayment: number; installments: number; includesRetainers: boolean; retainerAmount: number }, agreementPct = 0): OrthoPlan {
  const total = round2(Math.max(Number(i.totalAmount) || 0, 0));
  const initial = round2(Math.max(Number(i.initialPayment) || 0, 0));
  const n = Math.min(Math.max(Math.trunc(Number(i.installments) || 1), 1), ORTHO_MAX_INSTALLMENTS);
  const discount = round2(total * agreementPct / 100);
  const net = round2(total - discount);
  const rest = Math.max(round2(net - initial), 0);
  let inst = round2(rest / n);
  if (round2(inst * (n - 1)) > rest) inst = Math.trunc((rest / n) * 100) / 100;
  const last = round2(rest - inst * (n - 1));
  const retainer = i.includesRetainers ? round2(Math.max(Number(i.retainerAmount) || 0, 0)) : 0;
  return {
    total, discount, net, initial, installments: n, installmentAmount: inst, lastInstallmentAmount: last,
    retainer, grandTotal: round2(net + retainer), initialExceeds: initial > net,
  };
}

/** Suma n meses a una fecha YYYY-MM-DD (fin de mes ajustado como DATE_ADD de MySQL). */
export function addMonths(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Cronograma: N cuotas; la cuota k vence fecha + k meses. */
export function orthoSchedule(plan: Pick<OrthoPlan, 'installments' | 'installmentAmount' | 'lastInstallmentAmount'>, startDate: string) {
  return Array.from({ length: plan.installments }, (_, k) => ({
    installment_no: k + 1, month_index: k + 1, due_date: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? addMonths(startDate, k + 1) : '',
    amount: k + 1 === plan.installments ? plan.lastInstallmentAmount : plan.installmentAmount,
  }));
}
