'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CloudOff, Pencil, Printer, Trash2 } from 'lucide-react';
import { Button, Card, EmptyState, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useMasters, can } from '@/lib/client/app-context';
import { api, ApiError } from '@/lib/client/api';
import { BudgetEditor, type BudgetDraft } from '@/components/budgets/budget-editor';
import { BudgetDocument } from '@/components/budgets/budget-document';
import type { BudgetDetail } from '@/components/budgets/budget-types';
import { HelpButton, Tour, useTour } from '@/components/help/tour';
import { BUDGET_DETAIL_TOUR, BUDGET_EDITOR_TOUR } from '@/components/help/budget-tours';

export default function BudgetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { session, db } = useApp();
  const statuses = useMasters('BUDGET_STATUS');
  const [b, setB] = useState<BudgetDetail | null>(null);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const writable = can(session, 'budgets.edit');
  const detailTour = useTour('budget-detail', session.userId, !!b && !editing);
  const editorTour = useTour('budget-editor', session.userId, false);

  const load = useCallback(() => {
    api<BudgetDetail>(`/api/budgets/${id}`).then((r) => { setB(r); setOffline(false); })
      .catch((e) => e instanceof ApiError && e.isNetwork && setOffline(true));
  }, [id]);
  useEffect(load, [load]);
  // Título de la pestaña = nombre por defecto del PDF al imprimir (sin el nombre de la app)
  useEffect(() => {
    if (!b) return;
    const prev = document.title;
    document.title = `Presupuesto N° ${b.budget_number} - ${b.patient_last_name}, ${b.patient_first_name}`;
    return () => { document.title = prev; };
  }, [b]);

  if (offline && !b) return <Card><EmptyState icon={<CloudOff className="size-6" />} title="Presupuesto no disponible sin conexión" description="Se mostrará cuando vuelva la conexión. Si lo creaste sin conexión, está en la cola de sincronización." /></Card>;
  if (!b) return <Spinner />;

  if (editing) {
    const draft: BudgetDraft = {
      id: b.id, patientId: b.patient_id, doctorId: b.doctor_id, budgetDate: b.budget_date, statusCode: b.status_code as BudgetDraft['statusCode'],
      insuranceCompany: b.insurance_company, deductible: Number(b.deductible), coinsurancePct: Number(b.coinsurance_pct), discount: Number(b.discount),
      agreementId: b.agreement_id, branchId: b.branch_id, priceListId: b.price_list_id,
      notes: b.notes, items: b.items.map((i) => ({ id: i.id, toothCode: i.tooth_code, surfaces: i.surfaces, serviceId: i.service_id, description: i.description,
        quantity: Number(i.quantity), unitPrice: Number(i.unit_price), deductible: Number(i.deductible), coinsurance: Number(i.coinsurance) })),
      marks: b.marks.map((m) => ({ toothCode: m.tooth_code, surface: m.surface, conditionId: m.condition_id })),
    };
    return (
      <>
        <PageHeader title={`Editar presupuesto N° ${b.budget_number}`} actions={<HelpButton onClick={editorTour.start} />} />
        <Tour steps={BUDGET_EDITOR_TOUR} open={editorTour.open} onClose={editorTour.close} />
        <BudgetEditor initial={draft} onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
      </>
    );
  }

  async function setStatus(code: string) {
    try {
      await api(`/api/budgets/${id}/status`, { body: { statusCode: code } });
      await db?.budgets.update(id, { status_code: code });
      toast.success('Estado actualizado.');
      load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  async function remove() {
    try {
      await api(`/api/budgets/${id}`, { method: 'DELETE' });
      await db?.budgets.delete(id);
      toast.success('Presupuesto eliminado.');
      router.replace('/app/budgets');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  return (
    <>
      <div className="no-print">
        <PageHeader title={`Presupuesto N° ${b.budget_number}`} subtitle={`${b.patient_last_name}, ${b.patient_first_name} · H.C. ${b.record_number}`}
          actions={<>
            <HelpButton onClick={detailTour.start} />
            {writable && <div data-tour="budget-status"><Select aria-label="Estado" value={b.status_code} onChange={(e) => setStatus(e.target.value)} options={statuses.map((s) => ({ value: s.code, label: s.name }))} className="w-40" /></div>}
            <span data-tour="budget-print"><Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / PDF</Button></span>
            {writable && <span data-tour="budget-edit"><Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Editar</Button></span>}
            {writable && <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDel(true)} aria-label="Eliminar" />}
          </>} />
      </div>
      <div data-tour="budget-document"><BudgetDocument b={b} timezone={session.tenant!.timezone} /></div>
      <Tour steps={BUDGET_DETAIL_TOUR.filter((s) => writable || !['budget-status', 'budget-edit'].includes(s.target ?? ''))} open={detailTour.open} onClose={detailTour.close} />
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Eliminar presupuesto" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDel(false)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar el presupuesto N° {b.budget_number}?</p>
      </Modal>
    </>
  );
}
