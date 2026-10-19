'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClipboardList, CloudUpload, Plus, Search } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useApp, useMasters, can } from '@/lib/client/app-context';
import { formatDate, formatMoney } from '@/lib/shared/format';
import { HelpButton, Tour, useTour } from '@/components/help/tour';
import { BUDGET_LIST_TOUR } from '@/components/help/budget-tours';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function BudgetsPage() {
  const { db, session } = useApp();
  const router = useRouter();
  const statuses = useMasters('BUDGET_STATUS');
  const [q, setQ] = useState('');
  const tour = useTour('budget-list', session.userId);
  const [status, setStatus] = useState('');
  const budgets = useLiveQuery(async () => db?.budgets.orderBy('budget_date').reverse().toArray(), [db]);
  const patients = useLiveQuery(async () => db?.patients.toArray(), [db]);
  const doctors = useLiveQuery(async () => db?.doctors.toArray(), [db]);

  const pmap = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p])), [patients]);
  const dmap = useMemo(() => new Map((doctors ?? []).map((d) => [d.id, `${d.first_name} ${d.last_name}`])), [doctors]);
  const smap = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);

  const rows = useMemo(() => (budgets ?? []).filter((b) => {
    if (status && b.status_code !== status) return false;
    if (!q.trim()) return true;
    const p = pmap.get(b.patient_id);
    return norm(`${p?.first_name} ${p?.last_name} ${p?.record_number} ${b.budget_number}`).includes(norm(q.trim()));
  }), [budgets, status, q, pmap]);

  return (
    <>
      <PageHeader title="Presupuestos" subtitle="Últimos 6 meses disponibles sin conexión"
        actions={<>
          <HelpButton onClick={tour.start} />
          {can(session, 'budgets.write') && <Link href="/app/budgets/new" data-tour="new-budget"><Button icon={<Plus className="size-4" />}>Nuevo presupuesto</Button></Link>}
        </>} />
      <Tour steps={BUDGET_LIST_TOUR} open={tour.open} onClose={tour.close} />
      <Card data-tour="budget-list">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input aria-label="Buscar" placeholder="Paciente, H.C. o N° de presupuesto" value={q} onChange={(e) => setQ(e.target.value)} className="[&_input]:pl-9" />
          </div>
          <Select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos los estados"
            options={statuses.map((s) => ({ value: s.code, label: s.name }))} className="sm:w-56" />
        </div>
        {!budgets ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-6" />} title="Sin presupuestos" description="Crea un presupuesto con odontograma para un paciente." />
        ) : (
          <Table>
            <thead><tr><Th>N°</Th><Th>Fecha</Th><Th>Paciente</Th><Th>Doctor</Th><Th>Estado</Th><Th className="text-right">Total</Th></tr></thead>
            <tbody>
              {rows.map((b) => {
                const p = pmap.get(b.patient_id);
                const s = smap.get(b.status_code);
                return (
                  <tr key={b.id} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`/app/budgets/${b.id}`)}>
                    <Td label="N°" className="font-mono text-xs">{b.budget_number ?? (b.pending ? <Badge color="var(--warning)"><CloudUpload className="size-3" /> Pendiente</Badge> : '—')}</Td>
                    <Td label="Fecha">{formatDate(b.budget_date)}</Td>
                    <Td label="Paciente"><span className="font-medium">{p ? `${p.last_name}, ${p.first_name}` : '—'}</span></Td>
                    <Td label="Doctor">{b.doctor_id ? dmap.get(b.doctor_id) ?? '—' : '—'}</Td>
                    <Td label="Estado"><Badge color={s?.value}>{s?.name ?? b.status_code}</Badge></Td>
                    <Td label="Total" className="text-right font-medium tabular-nums">{formatMoney(b.total, session.tenant!.currencySymbol)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
