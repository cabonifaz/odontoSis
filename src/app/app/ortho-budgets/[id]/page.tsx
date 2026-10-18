'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CloudOff, Pencil, Printer, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, can } from '@/lib/client/app-context';
import { api, ApiError } from '@/lib/client/api';
import { OrthoBudgetEditor, orthoDraftFrom } from '@/components/ortho/ortho-budget-editor';
import { OrthoBudgetDocument } from '@/components/ortho/ortho-budget-document';
import type { OrthoBudgetDetail } from '@/components/ortho/ortho-types';

export default function OrthoBudgetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { session } = useApp();
  const [b, setB] = useState<OrthoBudgetDetail | null>(null);
  const [error, setError] = useState<'offline' | 'notfound' | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const writable = can(session, 'budgets.edit');

  const load = useCallback(() => {
    api<OrthoBudgetDetail>(`/api/ortho-budgets/${id}`).then((r) => { setB(r); setError(null); })
      .catch((e) => setError(e instanceof ApiError && e.isNetwork ? 'offline' : 'notfound'));
  }, [id]);
  useEffect(load, [load]);
  // Título de la pestaña = nombre por defecto del PDF al imprimir (sin el nombre de la app)
  useEffect(() => {
    if (!b) return;
    const prev = document.title;
    document.title = `Presupuesto de ortodoncia N° ${b.budget_number} - ${b.patient_last_name}, ${b.patient_first_name}`;
    return () => { document.title = prev; };
  }, [b]);

  if (error === 'offline' && !b) return <Card><EmptyState icon={<CloudOff className="size-6" />} title="Presupuesto no disponible sin conexión" description="Se mostrará cuando vuelva la conexión." /></Card>;
  if (error === 'notfound' && !b) return <Card><EmptyState title="Presupuesto de ortodoncia no encontrado" /></Card>;
  if (!b) return <Spinner />;

  if (editing) {
    return (
      <>
        <PageHeader title={`Editar presupuesto de ortodoncia N° ${b.budget_number}`} />
        <OrthoBudgetEditor initial={orthoDraftFrom(b)} onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
      </>
    );
  }

  async function remove() {
    try {
      await api(`/api/ortho-budgets/${id}`, { method: 'DELETE' });
      toast.success('Presupuesto de ortodoncia eliminado.');
      router.replace(`/app/patients/${b!.patient_id}`);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  return (
    <>
      <div className="no-print">
        <PageHeader title={`Presupuesto de ortodoncia N° ${b.budget_number}`}
          subtitle={<span className="inline-flex flex-wrap items-center gap-2">{`${b.patient_last_name}, ${b.patient_first_name}${b.record_number ? ` · H.C. ${b.record_number}` : ''}`}<Badge color={b.status_color}>{b.status_name}</Badge></span>}
          actions={<>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / PDF</Button>
            {writable && <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Editar</Button>}
            {writable && <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDel(true)} aria-label="Eliminar" />}
          </>} />
      </div>
      <OrthoBudgetDocument b={b} />
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Eliminar presupuesto de ortodoncia" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDel(false)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar el presupuesto de ortodoncia N° {b.budget_number}?</p>
      </Modal>
    </>
  );
}
