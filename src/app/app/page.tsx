'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CalendarDays, ClipboardList, Plus, Users, Wallet } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Stat } from '@/components/ui';
import { useApp, can } from '@/lib/client/app-context';
import { api, ApiError } from '@/lib/client/api';
import { formatMoney, formatTime } from '@/lib/shared/format';

type Dash = {
  kpis: { patients_total: number; appointments_today: number; budgets_pending: number; approved_this_month: number };
  appointments: { id: string; patient_name: string; doctor_name: string; start_at: string; end_at: string; status_name: string; status_color: string; reason: string | null; agenda_color: string }[];
};

export default function DashboardPage() {
  const { session, online } = useApp();
  const [data, setData] = useState<Dash | null>(null);
  const [offline, setOffline] = useState(false);
  const t = session.tenant!;

  useEffect(() => {
    api<Dash>('/api/dashboard').then(setData).catch((e) => e instanceof ApiError && e.isNetwork && setOffline(true));
  }, [online]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <>
      <PageHeader
        title={`${greet}, ${session.fullName.split(' ')[0]}`}
        subtitle={new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: t.timezone })}
        actions={<>
          {can(session, 'appointments.write') && <Link href="/app/agenda?new=1"><Button variant="secondary" icon={<CalendarDays className="size-4" />}>Nueva cita</Button></Link>}
          {can(session, 'budgets.write') && <Link href="/app/budgets/new"><Button icon={<Plus className="size-4" />}>Nuevo presupuesto</Button></Link>}
        </>}
      />
      {offline && !data ? (
        <Card><EmptyState title="Sin conexión" description="El resumen requiere internet. Puedes seguir usando Agenda, Pacientes y Presupuestos sin conexión." /></Card>
      ) : !data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Citas hoy" value={data.kpis.appointments_today} icon={<CalendarDays className="size-5" />} />
            <Stat label="Pacientes" value={data.kpis.patients_total} icon={<Users className="size-5" />} />
            <Stat label="Presupuestos pendientes" value={data.kpis.budgets_pending} icon={<ClipboardList className="size-5" />} />
            <Stat label="Aprobado este mes" value={formatMoney(data.kpis.approved_this_month, t.currencySymbol)} icon={<Wallet className="size-5" />} />
          </div>
          <Card className="mt-6">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">Agenda de hoy</h2>
              <Link href="/app/agenda" className="text-sm font-medium text-brand">Ver agenda</Link>
            </div>
            {data.appointments.length === 0 ? (
              <EmptyState icon={<CalendarDays className="size-6" />} title="No hay citas para hoy" />
            ) : (
              <ul className="divide-y divide-line">
                {data.appointments.map((a) => (
                  <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-24 shrink-0 text-sm font-semibold tabular-nums">{formatTime(a.start_at, t.timezone)}–{formatTime(a.end_at, t.timezone)}</div>
                    <span className="h-8 w-1 rounded-full" style={{ backgroundColor: a.agenda_color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.patient_name}</p>
                      <p className="truncate text-sm text-muted">{a.doctor_name}{a.reason ? ` · ${a.reason}` : ''}</p>
                    </div>
                    <Badge color={a.status_color}>{a.status_name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
