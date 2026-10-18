'use client';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, X } from 'lucide-react';
import { Button, Card, cx, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useAgreements, useApp, useBranches, useMasters, usePriceLists, usePriceMap } from '@/lib/client/app-context';
import { ApiError } from '@/lib/client/api';
import { PatientPicker, ServicePicker } from '@/components/pickers';
import { Odontogram, OdontogramLegend, toConditions, type Mark, type Selection, type Surface } from '@/components/odontogram/odontogram';
import { ConditionPalette, toggleMark } from '@/components/odontogram/condition-palette';
import { budgetSchema, type BudgetInput } from '@/lib/shared/schemas';
import { formatMoney, todayIn, toDbDateTime } from '@/lib/shared/format';
import type { LService } from '@/lib/client/offline-db';

type Item = BudgetInput['items'][number];
const SURFACE_ORDER: Surface[] = ['O', 'V', 'L', 'M', 'D'];
const round2 = (n: number) => Math.round(n * 100) / 100;

export type BudgetDraft = Omit<BudgetInput, 'marks'> & { marks: Mark[] };

export function emptyBudget(tz: string, patientId?: string | null, doctorId?: string | null): BudgetDraft {
  return {
    id: crypto.randomUUID(), patientId: patientId ?? '', doctorId: doctorId ?? null, budgetDate: todayIn(tz), statusCode: 'DRAFT',
    insuranceCompany: null, deductible: 0, coinsurancePct: 0, discount: 0, agreementId: null, branchId: null, priceListId: null, notes: null, items: [], marks: [],
  };
}

/** Total de una línea con el descuento del convenio (mismo cálculo que el SP) */
export const lineTotal = (i: { quantity: number; unitPrice: number }, agreementPct = 0) => round2(i.quantity * i.unitPrice * (1 - agreementPct / 100));

/** Lo que paga el paciente: con seguro = deducibles + coaseguros; particular = total (con convenio) - descuento */
export function patientPays(b: Pick<BudgetDraft, 'items' | 'insuranceCompany' | 'discount'>, agreementPct = 0) {
  const subtotal = b.items.reduce((s, i) => s + lineTotal(i, agreementPct), 0);
  const insured = !!b.insuranceCompany;
  const pays = insured ? b.items.reduce((s, i) => s + i.deductible + i.coinsurance, 0) : Math.max(subtotal - (b.discount ?? 0), 0);
  return { subtotal: round2(subtotal), pays: round2(pays), insured };
}

export function BudgetEditor({ initial, onSaved, onCancel }: { initial: BudgetDraft; onSaved: (id: string, queued: boolean) => void; onCancel: () => void }) {
  const { submit, session, db } = useApp();
  const toast = useToast();
  const symbol = session.tenant!.currencySymbol;
  const conditions = toConditions(useMasters('TOOTH_CONDITION'));
  const statuses = useMasters('BUDGET_STATUS');
  const doctors = useLiveQuery(async () => db?.doctors.filter((d) => !!d.is_active).toArray(), [db]) ?? [];

  const [b, setB] = useState<BudgetDraft>(initial);
  const agreements = useAgreements(b.budgetDate);
  const branches = useBranches();
  const priceLists = usePriceLists();
  const effectiveListId = b.priceListId ?? priceLists.find((l) => l.is_default)?.id ?? null;
  const priceMap = usePriceMap(effectiveListId);
  const priceOf = (svc: LService) => priceMap.get(svc.id) ?? Number(svc.price);
  const agreement = agreements.find((a) => a.id === b.agreementId) ?? null;
  const pct = agreement ? Number(agreement.discount_pct) : 0;
  const [tool, setTool] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [service, setService] = useState<LService | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const patch = (p: Partial<BudgetDraft>) => setB((x) => ({ ...x, ...p }));

  const planned = useMemo(() => new Set(b.items.map((i) => i.toothCode).filter(Boolean) as string[]), [b.items]);
  const totals = patientPays(b, pct);

  /** Deducible y coaseguro por ítem según el seguro, sobre el precio con convenio */
  const pctOf = (src: BudgetDraft) => Number(agreements.find((a) => a.id === src.agreementId)?.discount_pct ?? 0);
  const withInsurance = (i: Omit<Item, 'deductible' | 'coinsurance'>, src = b): Item => {
    if (!src.insuranceCompany) return { ...i, deductible: 0, coinsurance: 0 };
    const total = lineTotal(i, pctOf(src));
    const deductible = i.toothCode ? Math.min(src.deductible ?? 0, total) : 0;
    return { ...i, deductible, coinsurance: round2((total - deductible) * (src.coinsurancePct ?? 0) / 100) };
  };
  const recalc = (p: Partial<BudgetDraft>) => setB((x) => {
    const n = { ...x, ...p };
    return { ...n, items: n.items.map((i) => withInsurance(i, n)) };
  });

  function onSurface(tooth: string, surface: Surface) {
    if (tool) {
      const c = conditions.find((x) => x.id === tool);
      if (c) patch({ marks: toggleMark(b.marks, c, tooth, surface) });
      return;
    }
    setSel((s) => {
      if (!s || s.toothCode !== tooth) return { toothCode: tooth, surfaces: [surface] };
      const has = s.surfaces.includes(surface);
      return { toothCode: tooth, surfaces: has ? s.surfaces.filter((x) => x !== surface) : [...s.surfaces, surface] };
    });
  }
  function onTooth(tooth: string) {
    if (tool) {
      const c = conditions.find((x) => x.id === tool);
      if (c) patch({ marks: toggleMark(b.marks, c, tooth, null) });
      return;
    }
    // clic en el número: selecciona la pieza completa
    setSel({ toothCode: tooth, surfaces: [...SURFACE_ORDER] });
  }

  function addItem(general = false) {
    if (!service) return;
    const surfaces = !general && sel ? SURFACE_ORDER.filter((s) => sel.surfaces.includes(s)).join('') : null;
    const item = withInsurance({
      id: crypto.randomUUID(), toothCode: general ? null : sel?.toothCode ?? null, surfaces: surfaces || null,
      serviceId: service.id, description: service.name, quantity: 1, unitPrice: priceOf(service),
    });
    patch({ items: [...b.items, item] });
    setService(null);
  }

  const updateItem = (id: string, p: Partial<Item>) =>
    setB((x) => ({ ...x, items: x.items.map((i) => (i.id === id ? withInsurance({ ...i, ...p }, x) : i)) }));

  async function save() {
    const parsed = budgetSchema.safeParse({ ...b, priceListId: effectiveListId });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0]?.toString() ?? '', i.message])));
      toast.error(parsed.error.issues[0]?.message ?? 'Revisa el presupuesto.');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const data = parsed.data;
      const { queued } = await submit({ type: 'budget.save', payload: data }, 'Presupuesto', async (ldb) => {
        const prev = await ldb.budgets.get(data.id);
        await ldb.budgets.put({
          id: data.id, budget_number: prev?.budget_number ?? null, patient_id: data.patientId, doctor_id: data.doctorId ?? null,
          budget_date: data.budgetDate, valid_until: prev?.valid_until ?? null, status_code: data.statusCode, branch_id: data.branchId ?? null,
          total: Math.max(totals.subtotal - data.discount, 0), updated_at: toDbDateTime(new Date()), pending: true,
        });
      });
      toast.success(queued ? 'Presupuesto guardado sin conexión. Se sincronizará al reconectar.' : 'Presupuesto guardado.');
      onSaved(data.id, queued);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="md:col-span-2">
            <PatientPicker value={b.patientId || null} required error={errors.patientId ? 'Selecciona un paciente' : null}
              onChange={(p) => recalc({
                patientId: p?.id ?? '',
                insuranceCompany: p?.insurance_company ?? null,
                deductible: Number(p?.deductible ?? 0),
                coinsurancePct: Number(p?.coinsurance_pct ?? 0),
                // el convenio del paciente se aplica si está vigente a la fecha del presupuesto
                agreementId: p?.agreement_id && agreements.some((a) => a.id === p.agreement_id) ? p.agreement_id : null,
                priceListId: p?.price_list_id ?? null,
              })} />
          </div>
          <Select label="Doctor tratante" value={b.doctorId ?? ''} onChange={(e) => patch({ doctorId: e.target.value || null })} placeholder="—"
            options={doctors.map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }))} />
          <Input label="Fecha" type="date" value={b.budgetDate} onChange={(e) => patch({ budgetDate: e.target.value })} />
          {branches.length > 1 && (
            <Select label="Sede" value={b.branchId ?? branches[0]?.id ?? ''} onChange={(e) => patch({ branchId: e.target.value || null })}
              options={branches.map((s) => ({ value: s.id, label: s.name }))} />
          )}
          <Input label="Compañía de seguros" value={b.insuranceCompany ?? ''} placeholder="Particular" onChange={(e) => recalc({ insuranceCompany: e.target.value || null })} />
          <Input label="Deducible por pieza" type="number" min="0" step="0.01" value={b.deductible} disabled={!b.insuranceCompany} onChange={(e) => recalc({ deductible: Number(e.target.value) || 0 })} />
          <Input label="Coaseguro %" type="number" min="0" max="100" step="0.01" value={b.coinsurancePct} disabled={!b.insuranceCompany} onChange={(e) => recalc({ coinsurancePct: Number(e.target.value) || 0 })} />
          {priceLists.length > 1 && (
            <Select label="Tarifario" value={effectiveListId ?? ''} onChange={(e) => patch({ priceListId: e.target.value || null })}
              hint="Los tratamientos nuevos toman el precio de este tarifario"
              options={priceLists.map((l) => ({ value: l.id, label: `${l.group_name ? `${l.group_name} · ` : ''}${l.name}` }))} />
          )}
          <Select label="Convenio" value={b.agreementId ?? ''} onChange={(e) => recalc({ agreementId: e.target.value || null })} placeholder="Sin convenio"
            hint={agreement ? `Descuento de ${pct} % sobre la lista de precios` : undefined}
            options={agreements.map((a) => ({ value: a.id, label: `${a.name} (${Number(a.discount_pct)} %)` }))} />
          <Select label="Estado" value={b.statusCode} onChange={(e) => patch({ statusCode: e.target.value as BudgetDraft['statusCode'] })}
            options={statuses.map((s) => ({ value: s.code, label: s.name }))} />
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-semibold">Odontograma</h2>
          <ConditionPalette conditions={conditions} value={tool} allowSelect onChange={(v) => { setTool(v); setSel(null); }} />
        </div>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface p-2">
          <Odontogram marks={b.marks} conditions={conditions} selection={sel} planned={planned} onSurfaceClick={onSurface} onToothClick={onTooth} />
        </div>
        <div className="mt-3"><OdontogramLegend conditions={conditions} /></div>

        <div className="mt-4 rounded-lg border border-dashed border-line-strong bg-surface-2 p-4">
          {tool ? (
            <p className="text-sm text-muted">Modo hallazgos: haz clic en una superficie (o en el número de la pieza para hallazgos de pieza completa). Elige <strong>Seleccionar pieza</strong> para agregar tratamientos.</p>
          ) : (
            <div className="grid items-end gap-3 md:grid-cols-[auto_1fr_auto]">
              <div className="text-sm">
                <p className="text-muted">Pieza / superficies</p>
                {sel ? (
                  <p className="mt-1 flex items-center gap-2 font-semibold">
                    {sel.toothCode} <span className="font-mono text-brand">{SURFACE_ORDER.filter((s) => sel.surfaces.includes(s)).join('') || '—'}</span>
                    <button type="button" aria-label="Quitar selección" onClick={() => setSel(null)} className="text-muted"><X className="size-4" /></button>
                  </p>
                ) : <p className="mt-1 text-muted">Selecciona en el odontograma</p>}
              </div>
              <ServicePicker value={service?.id ?? null} onChange={setService} symbol={symbol} />
              <div className="flex gap-2">
                <Button icon={<Plus className="size-4" />} disabled={!service || !sel} onClick={() => addItem(false)}>Agregar a pieza</Button>
                <Button variant="secondary" disabled={!service} onClick={() => addItem(true)}>General</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold">Tratamientos</h2>
          {errors.items && <p className="text-sm text-danger">{errors.items}</p>}
        </div>
        {b.items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Agrega tratamientos desde el odontograma o como tratamiento general.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Pieza</th><th className="px-2 py-2">Sup.</th><th className="px-2 py-2">Tratamiento</th>
                  <th className="w-20 px-2 py-2">Cant.</th><th className="w-28 px-2 py-2">P. unit.</th>
                  {totals.insured && <><th className="px-2 py-2 text-right">Deducible</th><th className="px-2 py-2 text-right">Coaseguro</th></>}
                  <th className="px-2 py-2 text-right">Total</th><th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {b.items.map((i) => (
                  <tr key={i.id} className="border-b border-line">
                    <td className="px-4 py-2 font-mono">{i.toothCode ?? '—'}</td>
                    <td className="px-2 py-2 font-mono text-xs">{i.surfaces ?? ''}</td>
                    <td className="px-2 py-2">{i.description}</td>
                    <td className="px-2 py-2"><input aria-label="Cantidad" type="number" min="1" step="1" value={i.quantity} onChange={(e) => updateItem(i.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="h-8 w-16 rounded-control border border-line bg-surface px-2" /></td>
                    <td className="px-2 py-2"><input aria-label="Precio unitario" type="number" min="0" step="0.01" value={i.unitPrice} onChange={(e) => updateItem(i.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-24 rounded-control border border-line bg-surface px-2" /></td>
                    {totals.insured && <><td className="px-2 py-2 text-right tabular-nums">{formatMoney(i.deductible, symbol)}</td><td className="px-2 py-2 text-right tabular-nums">{formatMoney(i.coinsurance, symbol)}</td></>}
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {pct > 0 && <span className="mr-1.5 text-xs text-muted line-through">{formatMoney(i.quantity * i.unitPrice, symbol)}</span>}
                      {formatMoney(lineTotal(i, pct), symbol)}
                    </td>
                    <td className="px-2 py-2"><button type="button" aria-label="Quitar" onClick={() => patch({ items: b.items.filter((x) => x.id !== i.id) })} className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"><Trash2 className="size-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_320px]">
          <Textarea label="Observaciones" value={b.notes ?? ''} onChange={(e) => patch({ notes: e.target.value || null })} />
          <dl className="space-y-2 text-sm">
            {pct > 0 && (
              <div className="flex justify-between text-success"><dt>Ahorro por convenio ({pct} %)</dt>
                <dd className="tabular-nums">- {formatMoney(b.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) - totals.subtotal, symbol)}</dd></div>
            )}
            <div className="flex justify-between"><dt className="text-muted">Total tratamientos</dt><dd className="tabular-nums">{formatMoney(totals.subtotal, symbol)}</dd></div>
            {!totals.insured && (
              <div className="flex items-center justify-between gap-3"><dt className="text-muted">Descuento</dt>
                <dd><input aria-label="Descuento" type="number" min="0" step="0.01" value={b.discount} onChange={(e) => patch({ discount: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-28 rounded-control border border-line bg-surface px-2 text-right" /></dd></div>
            )}
            <div className={cx('flex justify-between border-t border-line pt-2 text-base font-semibold')}><dt>Total a cancelar</dt><dd className="tabular-nums">{formatMoney(totals.pays, symbol)}</dd></div>
            {totals.insured && <p className="text-xs text-muted">Con seguro: el paciente paga deducible + coaseguro.</p>}
          </dl>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button onClick={save} loading={saving}>Guardar presupuesto</Button>
      </div>
    </div>
  );
}
