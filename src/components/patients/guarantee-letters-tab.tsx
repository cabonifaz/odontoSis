'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudOff, FileCheck2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useMasters } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDate, formatMoney, todayIn } from '@/lib/shared/format';
import { GUARANTEE_LETTER_STATUSES } from '@/lib/shared/referral-schemas';

export type GuaranteeLetterRow = {
  id: string; patient_id: string; budget_id: string | null; budget_number: string | null; budget_total: number | null;
  budget_currency_symbol: string | null; insurance_company: string; letter_number: string | null; request_date: string;
  response_date: string | null; amount_requested: number; amount_approved: number | null; coverage_pct: number | null;
  status_code: string; status_name: string; status_color: string | null; valid_until: string | null; notes: string | null; updated_at: string;
};

type BudgetOption = { id: string; budget_number: string | null; budget_date: string; total: number; status_name?: string; currency_symbol?: string };

type Draft = {
  id: string; budgetId: string; insuranceCompany: string; letterNumber: string; requestDate: string; responseDate: string;
  amountRequested: string; amountApproved: string; coveragePct: string; statusCode: string; validUntil: string; notes: string;
};

const FALLBACK_STATUS: Record<string, { name: string; value: string }> = {
  DRAFT: { name: 'Borrador', value: '#6B7280' }, SENT: { name: 'Enviada', value: '#0EA5E9' }, APPROVED: { name: 'Aprobada', value: '#16A34A' },
  PARTIAL: { name: 'Aprobada parcial', value: '#F59E0B' }, REJECTED: { name: 'Rechazada', value: '#DC2626' },
};

const d10 = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
const numStr = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(Number(v)));

export function GuaranteeLettersTab({ patientId, writable }: { patientId: string; writable: boolean }) {
  const { db, session } = useApp();
  const toast = useToast();
  const sym = session.tenant?.currencySymbol ?? 'S/';
  const statusMasters = useMasters('GUARANTEE_LETTER_STATUS');
  const [rows, setRows] = useState<GuaranteeLetterRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [insurance, setInsurance] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<BudgetOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<GuaranteeLetterRow | null>(null);

  const statuses = useMemo(() => (statusMasters.length
    ? statusMasters.map((s) => ({ code: s.code, name: s.name, value: s.value }))
    : GUARANTEE_LETTER_STATUSES.map((code) => ({ code, ...FALLBACK_STATUS[code] }))), [statusMasters]);

  const load = useCallback(() => {
    api<{ rows: GuaranteeLetterRow[] }>(`/api/patients/${patientId}/guarantee-letters`)
      .then((r) => { setRows(r.rows); setOffline(false); })
      .catch((e) => { if (e instanceof ApiError && e.isNetwork) setOffline(true); setRows((prev) => prev ?? []); });
  }, [patientId]);
  useEffect(load, [load]);

  // Datos de apoyo para el formulario: aseguradora del paciente y sus presupuestos
  useEffect(() => {
    api<{ insuranceCompany: string | null }>(`/api/patients/${patientId}`).then((p) => setInsurance(p.insuranceCompany)).catch(() => {});
    api<{ rows: BudgetOption[] }>(`/api/budgets?patientId=${patientId}&limit=200`)
      .then((r) => setBudgets(r.rows))
      .catch(async () => {
        // Sin permiso budgets.read o sin conexión: se usan los presupuestos de la base local
        const local = db ? await db.budgets.where('patient_id').equals(patientId).toArray() : [];
        setBudgets(local.map((b) => ({ id: b.id, budget_number: b.budget_number ?? null, budget_date: b.budget_date, total: Number(b.total) })));
      });
  }, [patientId, db]);

  const budgetOptions = budgets.map((b) => ({
    value: b.id,
    label: `N° ${b.budget_number ?? '—'} · ${formatDate(d10(b.budget_date))} · ${formatMoney(b.total, b.currency_symbol ?? sym)}`,
  }));

  function openNew() {
    setErrors({});
    setDraft({
      id: crypto.randomUUID(), budgetId: '', insuranceCompany: insurance ?? '', letterNumber: '',
      requestDate: todayIn(session.tenant?.timezone), responseDate: '', amountRequested: '', amountApproved: '', coveragePct: '',
      statusCode: 'DRAFT', validUntil: '', notes: '',
    });
  }
  function openEdit(g: GuaranteeLetterRow) {
    setErrors({});
    setDraft({
      id: g.id, budgetId: g.budget_id ?? '', insuranceCompany: g.insurance_company, letterNumber: g.letter_number ?? '',
      requestDate: d10(g.request_date), responseDate: d10(g.response_date), amountRequested: numStr(g.amount_requested),
      amountApproved: numStr(g.amount_approved), coveragePct: numStr(g.coverage_pct), statusCode: g.status_code,
      validUntil: d10(g.valid_until), notes: g.notes ?? '',
    });
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  function pickBudget(budgetId: string) {
    const b = budgets.find((x) => x.id === budgetId);
    setDraft((d) => (d ? { ...d, budgetId, amountRequested: b ? numStr(b.total) : d.amountRequested } : d));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setErrors({});
    try {
      await api(`/api/patients/${patientId}/guarantee-letters`, {
        body: { ...draft, budgetId: draft.budgetId || null, amountRequested: draft.amountRequested || 0 },
      });
      toast.success('Carta de garantía guardada.');
      setDraft(null);
      load();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'Error');
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!toDelete) return;
    try {
      await api(`/api/patients/${patientId}/guarantee-letters/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Carta de garantía eliminada.');
      setToDelete(null);
      load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  const stMap = new Map(statuses.map((s) => [s.code, s]));
  // Si se aprobó un monto, se sugiere el % de cobertura
  const suggestedPct = draft && Number(draft.amountRequested) > 0 && draft.amountApproved !== ''
    ? Math.round((Number(draft.amountApproved) / Number(draft.amountRequested)) * 10000) / 100 : null;

  if (!rows) return <Spinner />;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="font-semibold">Cartas de garantía</h2>
        {writable && !offline && <Button size="sm" icon={<Plus className="size-4" />} onClick={openNew}>Nueva carta</Button>}
      </div>
      {offline && !rows.length ? (
        <EmptyState icon={<CloudOff className="size-6" />} title="Cartas de garantía no disponibles sin conexión" />
      ) : !rows.length ? (
        <EmptyState icon={<FileCheck2 className="size-6" />} title="Sin cartas de garantía"
          description="Registra las solicitudes de cobertura enviadas a la aseguradora del paciente y su respuesta." />
      ) : (
        <Table>
          <thead>
            <tr><Th>Solicitud</Th><Th>Aseguradora</Th><Th>N° carta</Th><Th>Presupuesto</Th><Th className="text-right">Solicitado</Th><Th className="text-right">Aprobado</Th><Th>Estado</Th>{writable && <Th />}</tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id}>
                <Td label="Solicitud">{formatDate(d10(g.request_date))}</Td>
                <Td label="Aseguradora"><span className="font-medium">{g.insurance_company}</span></Td>
                <Td label="N° carta"><span className="font-mono text-xs">{g.letter_number ?? '—'}</span></Td>
                <Td label="Presupuesto">
                  {g.budget_id ? <Link href={`/app/budgets/${g.budget_id}`} className="text-brand hover:underline">N° {g.budget_number}</Link> : '—'}
                </Td>
                <Td label="Solicitado" className="text-right tabular-nums">{formatMoney(g.amount_requested, sym)}</Td>
                <Td label="Aprobado" className="text-right tabular-nums">
                  {g.amount_approved !== null ? formatMoney(g.amount_approved, sym) : '—'}
                  {g.coverage_pct !== null && <span className="block text-xs text-muted">{Number(g.coverage_pct)} %</span>}
                </Td>
                <Td label="Estado">
                  <Badge color={g.status_color ?? stMap.get(g.status_code)?.value}>{g.status_name}</Badge>
                  {g.valid_until && <span className="mt-0.5 block text-xs text-muted">Vence {formatDate(d10(g.valid_until))}</span>}
                </Td>
                {writable && (
                  <Td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => openEdit(g)} aria-label="Editar" />
                    <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setToDelete(g)} aria-label="Eliminar" />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={rows.some((r) => r.id === draft?.id) ? 'Editar carta de garantía' : 'Nueva carta de garantía'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button><Button onClick={save} loading={saving}>Guardar</Button></>}>
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Aseguradora" required maxLength={150} value={draft.insuranceCompany} onChange={(e) => set('insuranceCompany', e.target.value)}
              error={errors.insuranceCompany} hint={insurance ? undefined : 'El paciente no tiene un seguro registrado en su ficha.'} />
            <Input label="N° de carta" maxLength={40} value={draft.letterNumber} onChange={(e) => set('letterNumber', e.target.value)} error={errors.letterNumber}
              hint="Número asignado por la aseguradora" />
            <Select label="Presupuesto vinculado" placeholder="Sin presupuesto" className="sm:col-span-2" value={draft.budgetId}
              onChange={(e) => pickBudget(e.target.value)} options={budgetOptions} error={errors.budgetId}
              hint={budgets.length ? 'Al vincular un presupuesto se usa su total como monto solicitado.' : 'El paciente no tiene presupuestos.'} />
            <Input type="date" label="Fecha de solicitud" required value={draft.requestDate} onChange={(e) => set('requestDate', e.target.value)} error={errors.requestDate} />
            <Input type="date" label="Fecha de respuesta" value={draft.responseDate} onChange={(e) => set('responseDate', e.target.value)} error={errors.responseDate} />
            <Input type="number" inputMode="decimal" min={0} step="0.01" label={`Monto solicitado (${sym})`} required value={draft.amountRequested}
              onChange={(e) => set('amountRequested', e.target.value)} error={errors.amountRequested} />
            <Input type="number" inputMode="decimal" min={0} step="0.01" label={`Monto aprobado (${sym})`} value={draft.amountApproved}
              onChange={(e) => set('amountApproved', e.target.value)} error={errors.amountApproved} />
            <Input type="number" inputMode="decimal" min={0} max={100} step="0.01" label="Cobertura (%)" value={draft.coveragePct}
              onChange={(e) => set('coveragePct', e.target.value)} error={errors.coveragePct}
              hint={suggestedPct !== null && draft.coveragePct === '' ? `Según montos: ${suggestedPct} %` : undefined} />
            <Select label="Estado" value={draft.statusCode} onChange={(e) => set('statusCode', e.target.value)}
              options={statuses.map((s) => ({ value: s.code, label: s.name }))} error={errors.statusCode} />
            <Input type="date" label="Vigente hasta" value={draft.validUntil} onChange={(e) => set('validUntil', e.target.value)} error={errors.validUntil} />
            <Textarea label="Observaciones" className="sm:col-span-2" maxLength={4000} value={draft.notes} onChange={(e) => set('notes', e.target.value)} error={errors.notes} />
          </div>
        )}
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar carta de garantía" size="sm"
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar la carta de garantía de {toDelete?.insurance_company}{toDelete?.letter_number ? ` N° ${toDelete.letter_number}` : ''}?</p>
      </Modal>
    </Card>
  );
}
