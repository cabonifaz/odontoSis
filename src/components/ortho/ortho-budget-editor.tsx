'use client';
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Card, Checkbox, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useAgreements, useApp, useBranches, useMasters } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { PatientPicker } from '@/components/pickers';
import { orthoBudgetSchema, orthoPlan, orthoSchedule, ORTHO_MAX_INSTALLMENTS, type OrthoBudgetInput } from '@/lib/shared/ortho-schemas';
import { formatDate, formatMoney, todayIn } from '@/lib/shared/format';
import type { OrthoBudgetDetail } from './ortho-types';

export type OrthoBudgetDraft = OrthoBudgetInput;

export function emptyOrthoBudget(tz: string, patientId?: string | null, doctorId?: string | null): OrthoBudgetDraft {
  return {
    id: crypto.randomUUID(), patientId: patientId ?? '', doctorId: doctorId ?? null, branchId: null, budgetDate: todayIn(tz),
    statusCode: 'DRAFT', applianceId: '', diagnosis: null, treatmentPlan: null, estimatedMonths: 24, totalAmount: 0,
    initialPayment: 0, installments: 12, includesRetainers: false, retainerAmount: 0, agreementId: null, notes: null,
  };
}

export function orthoDraftFrom(b: OrthoBudgetDetail): OrthoBudgetDraft {
  return {
    id: b.id, patientId: b.patient_id, doctorId: b.doctor_id, branchId: b.branch_id, budgetDate: b.budget_date,
    statusCode: b.status_code as OrthoBudgetDraft['statusCode'], applianceId: b.appliance_id, diagnosis: b.diagnosis,
    treatmentPlan: b.treatment_plan, estimatedMonths: Number(b.estimated_months), totalAmount: Number(b.total_amount),
    initialPayment: Number(b.initial_payment), installments: Number(b.installments), includesRetainers: !!b.includes_retainers,
    retainerAmount: Number(b.retainer_amount), agreementId: b.agreement_id, notes: b.notes,
  };
}

const num = (v: string) => (v === '' ? 0 : Number(v));

export function OrthoBudgetEditor({ initial, onSaved, onCancel }: { initial: OrthoBudgetDraft; onSaved: (id: string) => void; onCancel: () => void }) {
  const { session, db } = useApp();
  const toast = useToast();
  const symbol = session.tenant!.currencySymbol;
  const appliances = useMasters('ORTHO_APPLIANCE');
  const statuses = useMasters('BUDGET_STATUS');
  const doctors = useLiveQuery(async () => db?.doctors.filter((d) => !!d.is_active).toArray(), [db]) ?? [];
  const branches = useBranches();

  const [b, setB] = useState<OrthoBudgetDraft>(initial);
  const agreements = useAgreements(b.budgetDate);
  const agreement = agreements.find((a) => a.id === b.agreementId) ?? null;
  const pct = agreement ? Number(agreement.discount_pct) : 0;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<OrthoBudgetDraft>) => setB((x) => ({ ...x, ...p }));

  const plan = orthoPlan(b, pct);
  const schedule = orthoSchedule(plan, b.budgetDate);

  async function save() {
    const parsed = orthoBudgetSchema.safeParse(b);
    const errs: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path[0]?.toString() ?? '', i.message]));
    if (plan.initialExceeds) errs.initialPayment = 'La cuota inicial no puede superar el total con descuento.';
    if (!parsed.success || Object.keys(errs).length) {
      setErrors(errs);
      toast.error(Object.values(errs)[0] ?? 'Revisa el presupuesto.');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api('/api/ortho-budgets', { body: parsed.data });
      toast.success('Presupuesto de ortodoncia guardado.');
      onSaved(parsed.data.id);
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Datos generales</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="md:col-span-2">
            <PatientPicker value={b.patientId || null} required error={errors.patientId ? 'Selecciona un paciente' : null}
              onChange={(p) => patch({
                patientId: p?.id ?? '',
                // el convenio del paciente se aplica si está vigente a la fecha del presupuesto
                agreementId: p?.agreement_id && agreements.some((a) => a.id === p.agreement_id) ? p.agreement_id : null,
              })} />
          </div>
          <Select label="Doctor tratante" value={b.doctorId ?? ''} onChange={(e) => patch({ doctorId: e.target.value || null })} placeholder="—"
            options={doctors.map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }))} />
          <Input label="Fecha" type="date" required value={b.budgetDate} error={errors.budgetDate} onChange={(e) => patch({ budgetDate: e.target.value })} />
          {branches.length > 1 && (
            <Select label="Sede" value={b.branchId ?? branches[0]?.id ?? ''} onChange={(e) => patch({ branchId: e.target.value || null })}
              options={branches.map((s) => ({ value: s.id, label: s.name }))} />
          )}
          <Select label="Aparatología" required value={b.applianceId} error={errors.applianceId ? 'Selecciona el tipo de aparato' : null}
            onChange={(e) => patch({ applianceId: e.target.value })} placeholder="Selecciona…"
            options={appliances.map((a) => ({ value: a.id, label: a.name }))} />
          <Input label="Duración estimada (meses)" type="number" min="1" max="120" step="1" required value={b.estimatedMonths || ''} error={errors.estimatedMonths}
            onChange={(e) => patch({ estimatedMonths: Math.trunc(num(e.target.value)) })} />
          <Select label="Estado" value={b.statusCode} onChange={(e) => patch({ statusCode: e.target.value as OrthoBudgetDraft['statusCode'] })}
            options={statuses.map((s) => ({ value: s.code, label: s.name }))} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Diagnóstico y plan de tratamiento</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Textarea label="Diagnóstico" rows={4} maxLength={4000} value={b.diagnosis ?? ''} error={errors.diagnosis}
            placeholder="Ej.: Maloclusión clase II división 1, apiñamiento moderado…" onChange={(e) => patch({ diagnosis: e.target.value || null })} />
          <Textarea label="Plan de tratamiento" rows={4} maxLength={4000} value={b.treatmentPlan ?? ''} error={errors.treatmentPlan}
            placeholder="Ej.: Ortodoncia fija superior e inferior, controles mensuales…" onChange={(e) => patch({ treatmentPlan: e.target.value || null })} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Costo y forma de pago</h2>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <Select label="Convenio" value={b.agreementId ?? ''} onChange={(e) => patch({ agreementId: e.target.value || null })} placeholder="Sin convenio"
              hint={agreement ? `Descuento de ${pct} % sobre el costo del tratamiento` : undefined}
              options={agreements.map((a) => ({ value: a.id, label: `${a.name} (${Number(a.discount_pct)} %)` }))} />
            <Input label={`Costo del tratamiento (${symbol})`} type="number" min="0" step="0.01" required value={b.totalAmount || ''} error={errors.totalAmount}
              onChange={(e) => patch({ totalAmount: Math.max(0, num(e.target.value)) })} />
            <Input label={`Cuota inicial (${symbol})`} type="number" min="0" step="0.01" value={b.initialPayment || ''}
              error={errors.initialPayment ?? (plan.initialExceeds ? 'Supera el total con descuento' : null)}
              onChange={(e) => patch({ initialPayment: Math.max(0, num(e.target.value)) })} />
            <Input label="N° de cuotas mensuales" type="number" min="1" max={ORTHO_MAX_INSTALLMENTS} step="1" required value={b.installments || ''} error={errors.installments}
              hint={`Cuota mensual: ${formatMoney(plan.installmentAmount, symbol)}`}
              onChange={(e) => patch({ installments: Math.trunc(num(e.target.value)) })} />
            <div className="flex flex-col justify-end gap-2 sm:col-span-2 sm:flex-row sm:items-end sm:justify-start sm:gap-6">
              <div className="pb-2.5">
                <Checkbox label="Incluye contención (retenedores)" checked={b.includesRetainers} onChange={(v) => patch({ includesRetainers: v })} />
              </div>
              {b.includesRetainers && (
                <Input label={`Costo de la contención (${symbol})`} type="number" min="0" step="0.01" value={b.retainerAmount || ''} error={errors.retainerAmount}
                  className="sm:w-56" onChange={(e) => patch({ retainerAmount: Math.max(0, num(e.target.value)) })} />
              )}
            </div>
            <Textarea label="Observaciones" className="sm:col-span-2" value={b.notes ?? ''} maxLength={2000} onChange={(e) => patch({ notes: e.target.value || null })} />
          </div>

          <div className="space-y-4">
            <dl className="space-y-2 rounded-lg border border-line bg-surface-2 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Costo del tratamiento</dt><dd className="tabular-nums">{formatMoney(plan.total, symbol)}</dd></div>
              {plan.discount > 0 && (
                <div className="flex justify-between text-success"><dt>Descuento convenio ({pct} %)</dt><dd className="tabular-nums">- {formatMoney(plan.discount, symbol)}</dd></div>
              )}
              <div className="flex justify-between font-medium"><dt>Total tratamiento</dt><dd className="tabular-nums">{formatMoney(plan.net, symbol)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Cuota inicial</dt><dd className="tabular-nums">{formatMoney(plan.initial, symbol)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-muted">{plan.installments} cuota{plan.installments === 1 ? '' : 's'} mensual{plan.installments === 1 ? '' : 'es'} de</dt>
                <dd className="tabular-nums">{formatMoney(plan.installmentAmount, symbol)}</dd>
              </div>
              {plan.installments > 1 && plan.lastInstallmentAmount !== plan.installmentAmount && (
                <p className="text-xs text-muted">La última cuota es de {formatMoney(plan.lastInstallmentAmount, symbol)} (ajuste por redondeo).</p>
              )}
              {plan.retainer > 0 && (
                <div className="flex justify-between"><dt className="text-muted">Contención (retenedores)</dt><dd className="tabular-nums">{formatMoney(plan.retainer, symbol)}</dd></div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total a cancelar</dt><dd className="tabular-nums">{formatMoney(plan.grandTotal, symbol)}</dd></div>
            </dl>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Cuota</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.initial > 0 && (
                    <tr className="border-t border-line"><td className="px-3 py-1.5">Inicial</td><td className="px-3 py-1.5">{formatDate(b.budgetDate)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(plan.initial, symbol)}</td></tr>
                  )}
                  {schedule.map((s) => (
                    <tr key={s.installment_no} className="border-t border-line">
                      <td className="px-3 py-1.5">{s.installment_no}</td><td className="px-3 py-1.5">{formatDate(s.due_date)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(s.amount, symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Vista previa. Los montos definitivos los calcula el sistema al guardar.</p>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={save} loading={saving}>Guardar presupuesto</Button>
      </div>
    </div>
  );
}
