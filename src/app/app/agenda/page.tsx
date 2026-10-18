'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, CloudUpload, Plus } from 'lucide-react';
import { Badge, Button, Card, cx, Input, Modal, PageHeader, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useBranches, useMasters, can } from '@/lib/client/app-context';
import { ApiError } from '@/lib/client/api';
import { PatientPicker } from '@/components/pickers';
import type { LAppointment } from '@/lib/client/offline-db';
import { appointmentSchema } from '@/lib/shared/schemas';
import { addDays, parseDbDate, todayIn, toDbDateTime, weekStart, zonedParts, zonedToUtc } from '@/lib/shared/format';

const START_H = 7;
const END_H = 21;
const SLOT_PX = 48; // alto de 1 hora

/**
 * Distribuye en columnas las citas que se cruzan en el mismo día (p. ej. dos doctores a la misma hora),
 * para que todas sean visibles lado a lado. Devuelve { col, cols } por cita.
 */
function layoutDay(items: LAppointment[]) {
  const sorted = [...items].sort((a, b) => a.start_at.localeCompare(b.start_at) || b.end_at.localeCompare(a.end_at));
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: LAppointment[] = [];
  let clusterEnd = '';
  let colEnds: string[] = [];
  const flush = () => {
    const cols = colEnds.length || 1;
    for (const a of cluster) out.set(a.id, { col: out.get(a.id)!.col, cols });
    cluster = []; colEnds = []; clusterEnd = '';
  };
  for (const a of sorted) {
    if (cluster.length && a.start_at >= clusterEnd) flush();
    // primera columna libre (cuya última cita ya terminó)
    let col = colEnds.findIndex((end) => end <= a.start_at);
    if (col === -1) { col = colEnds.length; colEnds.push(a.end_at); } else colEnds[col] = a.end_at;
    out.set(a.id, { col, cols: 1 });
    cluster.push(a);
    if (a.end_at > clusterEnd) clusterEnd = a.end_at;
  }
  if (cluster.length) flush();
  return out;
}

type Draft = { id: string; branchId: string; patientId: string; doctorId: string; date: string; start: string; duration: number; statusCode: string; reason: string; notes: string; isNew: boolean };

export default function AgendaPage() {
  const { db, session, submit } = useApp();
  const toast = useToast();
  const params = useSearchParams();
  const tz = session.tenant!.timezone;
  const statuses = useMasters('APPOINTMENT_STATUS');
  const writable = can(session, 'appointments.write');

  const [day, setDay] = useState(() => { const q = params.get('date'); return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayIn(tz); });
  const [view, setView] = useState<'week' | 'day'>('week');
  const [doctorFilter, setDoctorFilter] = useState(session.roleCode === 'DOCTOR' && session.doctorId ? session.doctorId : '');
  const [draft, setDraft] = useState<Draft | null>(null);
  const branches = useBranches();
  const [branchFilter, setBranchFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) setView('day');
  }, []);

  const doctorsQ = useLiveQuery(async () => db?.doctors.filter((d) => !!d.is_active).toArray(), [db]);
  const doctors = useMemo(() => doctorsQ ?? [], [doctorsQ]);
  const patientsQ = useLiveQuery(async () => db?.patients.toArray(), [db]);
  const patients = useMemo(() => patientsQ ?? [], [patientsQ]);
  const days = useMemo(() => (view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(day), i)) : [day]), [view, day]);
  const fromUtc = toDbDateTime(zonedToUtc(days[0], '00:00', tz));
  const toUtc = toDbDateTime(zonedToUtc(addDays(days[days.length - 1], 1), '00:00', tz));
  const appts = useLiveQuery(async () => db?.appointments.where('start_at').between(fromUtc, toUtc).toArray(), [db, fromUtc, toUtc]) ?? [];

  const pmap = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const dmap = useMemo(() => new Map(doctors.map((d) => [d.id, d])), [doctors]);
  const smap = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);
  const visible = appts.filter((a) => (!doctorFilter || a.doctor_id === doctorFilter) && (!branchFilter || a.branch_id === branchFilter));

  // Abrir "nueva cita" desde otra pantalla (?new=1&patientId=)
  useEffect(() => {
    if (params.get('new') === '1' && writable && doctors.length && !draft) openNew(todayIn(tz), '09:00', params.get('patientId') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors.length]);

  function openNew(date: string, start: string, patientId = '') {
    setError(null);
    setDraft({ id: crypto.randomUUID(), branchId: branchFilter || branches[0]?.id || '', patientId, doctorId: doctorFilter || session.doctorId || doctors[0]?.id || '', date, start, duration: 30, statusCode: 'SCHEDULED', reason: '', notes: '', isNew: true });
  }
  function openEdit(a: LAppointment) {
    const s = parseDbDate(a.start_at)!;
    const e = parseDbDate(a.end_at)!;
    const p = zonedParts(s, tz);
    setError(null);
    setDraft({ id: a.id, branchId: a.branch_id ?? branches[0]?.id ?? '', patientId: a.patient_id, doctorId: a.doctor_id, date: p.date, start: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
      duration: Math.round((e.getTime() - s.getTime()) / 60000), statusCode: a.status_code, reason: a.reason ?? '', notes: a.notes ?? '', isNew: false });
  }

  async function save() {
    if (!draft) return;
    const startAt = zonedToUtc(draft.date, draft.start, tz);
    const endAt = new Date(startAt.getTime() + draft.duration * 60000);
    const parsed = appointmentSchema.safeParse({ id: draft.id, patientId: draft.patientId, doctorId: draft.doctorId, startAt: startAt.toISOString(), endAt: endAt.toISOString(), statusCode: draft.statusCode, reason: draft.reason, notes: draft.notes, branchId: draft.branchId || null });
    if (!parsed.success) { setError('Completa paciente, doctor, fecha y hora.'); return; }
    // Validación local de choque de horario (el servidor vuelve a validar)
    const s1 = toDbDateTime(startAt), e1 = toDbDateTime(endAt);
    const clash = !['CANCELLED', 'NO_SHOW'].includes(draft.statusCode) && appts.some((a) => a.id !== draft.id && a.doctor_id === draft.doctorId && !['CANCELLED', 'NO_SHOW'].includes(a.status_code) && a.start_at < e1 && a.end_at > s1);
    if (clash) { setError('El doctor ya tiene una cita en ese horario.'); return; }
    setSaving(true);
    try {
      const { queued } = await submit({ type: 'appointment.save', payload: parsed.data }, 'Cita', async (ldb) => {
        await ldb.appointments.put({ id: draft.id, branch_id: draft.branchId || null, patient_id: draft.patientId, doctor_id: draft.doctorId, start_at: s1, end_at: e1, status_code: draft.statusCode, reason: draft.reason || null, notes: draft.notes || null, updated_at: toDbDateTime(new Date()), pending: true });
      });
      toast.success(queued ? 'Cita guardada sin conexión.' : 'Cita guardada.');
      setDraft(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const title = view === 'week'
    ? `${new Date(days[0] + 'T12:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(days[6] + 'T12:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
    : new Date(day + 'T12:00:00Z').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  return (
    <>
      <PageHeader title="Agenda" actions={writable && <Button icon={<Plus className="size-4" />} onClick={() => openNew(day, '09:00')}>Nueva cita</Button>} />
      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Anterior" onClick={() => setDay(addDays(day, view === 'week' ? -7 : -1))}><ChevronLeft className="size-4" /></Button>
          <Button variant="secondary" size="sm" onClick={() => setDay(todayIn(tz))}>Hoy</Button>
          <Button variant="secondary" size="sm" aria-label="Siguiente" onClick={() => setDay(addDays(day, view === 'week' ? 7 : 1))}><ChevronRight className="size-4" /></Button>
          <span className="ml-2 font-semibold capitalize">{title}</span>
        </div>
        <div className="flex gap-2">
          {branches.length > 1 && (
            <Select aria-label="Sede" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} placeholder="Todas las sedes"
              options={branches.map((s) => ({ value: s.id, label: s.name }))} className="min-w-40" />
          )}
          <Select aria-label="Doctor" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} placeholder="Todos los doctores"
            options={doctors.map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }))} className="min-w-44" />
          <div className="hidden rounded-control border border-line p-0.5 md:flex">
            {(['day', 'week'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cx('rounded-[6px] px-3 text-sm', view === v ? 'bg-brand-soft font-medium text-brand' : 'text-muted')}>{v === 'day' ? 'Día' : 'Semana'}</button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(${view === 'week' ? 120 : 220}px, 1fr))` }}>
            <div className="sticky left-0 z-10 border-b border-line bg-surface" />
            {days.map((d) => {
              const isToday = d === todayIn(tz);
              return (
                <div key={d} className={cx('border-b border-l border-line px-2 py-2 text-center text-sm', isToday && 'bg-brand-soft')}>
                  <span className="capitalize text-muted">{new Date(d + 'T12:00:00Z').toLocaleDateString('es-PE', { weekday: 'short', timeZone: 'UTC' })}</span>{' '}
                  <span className={cx('font-semibold', isToday && 'text-brand')}>{d.slice(8)}</span>
                </div>
              );
            })}
            <div className="sticky left-0 z-10 bg-surface">
              {hours.map((h) => <div key={h} style={{ height: SLOT_PX }} className="border-b border-line pr-2 pt-1 text-right text-xs text-muted">{String(h).padStart(2, '0')}:00</div>)}
            </div>
            {days.map((d) => (
              <div key={d} className="relative border-l border-line" style={{ height: hours.length * SLOT_PX }}>
                {hours.map((h) => (
                  <div key={h} style={{ height: SLOT_PX }} className="border-b border-line">
                    {[0, 30].map((m) => (
                      <button key={m} aria-label={`Nueva cita ${d} ${h}:${m || '00'}`} disabled={!writable}
                        onClick={() => openNew(d, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)}
                        className="block h-1/2 w-full hover:bg-brand-soft/60 disabled:hover:bg-transparent" />
                    ))}
                  </div>
                ))}
                {(() => {
                  const dayAppts = visible.filter((a) => zonedParts(parseDbDate(a.start_at)!, tz).date === d);
                  const lanes = layoutDay(dayAppts);
                  return dayAppts.map((a) => {
                  const lane = lanes.get(a.id) ?? { col: 0, cols: 1 };
                  const s = zonedParts(parseDbDate(a.start_at)!, tz);
                  const mins = (parseDbDate(a.end_at)!.getTime() - parseDbDate(a.start_at)!.getTime()) / 60000;
                  const top = ((s.hour - START_H) + s.minute / 60) * SLOT_PX;
                  const doc = dmap.get(a.doctor_id);
                  const p = pmap.get(a.patient_id);
                  const st = smap.get(a.status_code);
                  const color = doc?.agenda_color ?? 'var(--brand)';
                  return (
                    <button key={a.id} onClick={() => openEdit(a)}
                      title={`${p ? `${p.first_name} ${p.last_name}` : 'Paciente'} · ${doc ? `${doc.first_name} ${doc.last_name}` : ''} · ${st?.name ?? ''}`}
                      className={cx('absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-xs shadow-card ring-1 ring-surface hover:z-10', a.status_code === 'CANCELLED' && 'opacity-50 line-through')}
                      style={{
                        top: Math.max(top, 0), height: Math.max((mins / 60) * SLOT_PX - 2, 20),
                        left: `calc(${(lane.col / lane.cols) * 100}% + 2px)`, width: `calc(${100 / lane.cols}% - 4px)`,
                        borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 14%, var(--surface))`,
                      }}>
                      <p className="truncate font-semibold">{p ? `${p.first_name} ${p.last_name}` : 'Paciente'}</p>
                      <p className="truncate text-muted">{String(s.hour).padStart(2, '0')}:{String(s.minute).padStart(2, '0')}{!doctorFilter && doc ? ` · ${doc.first_name}` : ''} · {st?.name}{a.pending ? ' · ⏳' : ''}</p>
                    </button>
                  );
                  });
                })()}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.isNew ? 'Nueva cita' : 'Editar cita'}
        footer={writable && <><Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button><Button onClick={save} loading={saving}>Guardar</Button></>}>
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <PatientPicker value={draft.patientId || null} required onChange={(p) => setDraft({ ...draft, patientId: p?.id ?? '' })} />
            </div>
            <Select label="Doctor" required value={draft.doctorId} onChange={(e) => setDraft({ ...draft, doctorId: e.target.value })}
              options={doctors.map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }))} placeholder="—" />
            {branches.length > 1 && (
              <Select label="Sede" value={draft.branchId} onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}
                options={branches.map((s) => ({ value: s.id, label: s.name }))} />
            )}
            <Select label="Estado" value={draft.statusCode} onChange={(e) => setDraft({ ...draft, statusCode: e.target.value })}
              options={statuses.map((s) => ({ value: s.code, label: s.name }))} />
            <Input label="Fecha" type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Hora" type="time" step={900} required value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              <Select label="Duración" value={String(draft.duration)} onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}
                options={[15, 30, 45, 60, 90, 120].map((m) => ({ value: String(m), label: `${m} min` }))} />
            </div>
            <Input label="Motivo" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className="sm:col-span-2" />
            <Textarea label="Notas" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="sm:col-span-2" />
            {!draft.isNew && appts.find((a) => a.id === draft.id)?.pending && <p className="sm:col-span-2"><Badge color="var(--warning)"><CloudUpload className="size-3" /> Pendiente de sincronizar</Badge></p>}
            {error && <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
