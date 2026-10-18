'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudOff, Pencil, Plus, Printer, Send, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useMasters } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDate, todayIn } from '@/lib/shared/format';
import { REFERRAL_STATUSES } from '@/lib/shared/referral-schemas';

export type ReferralRow = {
  id: string; patient_id: string; from_doctor_id: string | null; from_doctor_name: string | null; referral_date: string;
  specialty_id: string | null; specialty_name: string | null; referred_to_name: string | null; referred_to_contact: string | null;
  is_internal: number; to_doctor_id: string | null; to_doctor_name: string | null; reason: string; clinical_notes: string | null;
  status_code: string; status_name: string; status_color: string | null; response_notes: string | null; updated_at: string;
};

type Draft = {
  id: string; fromDoctorId: string; referralDate: string; specialtyId: string; isInternal: boolean; toDoctorId: string;
  referredToName: string; referredToContact: string; reason: string; clinicalNotes: string; statusCode: string; responseNotes: string;
};

/** Valores por defecto si el catálogo aún no llegó a la base local */
const FALLBACK_STATUS: Record<string, { name: string; value: string }> = {
  PENDING: { name: 'Pendiente', value: '#F59E0B' }, SCHEDULED: { name: 'Agendada', value: '#0EA5E9' },
  ATTENDED: { name: 'Atendida', value: '#16A34A' }, CANCELLED: { name: 'Cancelada', value: '#6B7280' },
};

export function ReferralsTab({ patientId, writable }: { patientId: string; writable: boolean }) {
  const { db, session } = useApp();
  const toast = useToast();
  const specialties = useMasters('SPECIALTY');
  const statusMasters = useMasters('REFERRAL_STATUS');
  const doctors = useLiveQuery(async () => (db ? (await db.doctors.toArray()).filter((d) => d.is_active)
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)) : []), [db], []);
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<ReferralRow | null>(null);

  const statuses = useMemo(() => (statusMasters.length
    ? statusMasters.map((s) => ({ code: s.code, name: s.name, value: s.value }))
    : REFERRAL_STATUSES.map((code) => ({ code, ...FALLBACK_STATUS[code] }))), [statusMasters]);

  const load = useCallback(() => {
    api<{ rows: ReferralRow[] }>(`/api/patients/${patientId}/referrals`)
      .then((r) => { setRows(r.rows); setOffline(false); })
      .catch((e) => { if (e instanceof ApiError && e.isNetwork) setOffline(true); setRows((prev) => prev ?? []); });
  }, [patientId]);
  useEffect(load, [load]);

  const doctorOptions = doctors.map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }));
  const myDoctor = session.doctorId ?? '';

  function openNew() {
    setErrors({});
    setDraft({
      id: crypto.randomUUID(), fromDoctorId: myDoctor, referralDate: todayIn(session.tenant?.timezone), specialtyId: '',
      isInternal: false, toDoctorId: '', referredToName: '', referredToContact: '', reason: '', clinicalNotes: '',
      statusCode: 'PENDING', responseNotes: '',
    });
  }
  function openEdit(r: ReferralRow) {
    setErrors({});
    setDraft({
      id: r.id, fromDoctorId: r.from_doctor_id ?? '', referralDate: r.referral_date.slice(0, 10), specialtyId: r.specialty_id ?? '',
      isInternal: !!r.is_internal, toDoctorId: r.to_doctor_id ?? '', referredToName: r.is_internal ? '' : r.referred_to_name ?? '',
      referredToContact: r.referred_to_contact ?? '', reason: r.reason, clinicalNotes: r.clinical_notes ?? '',
      statusCode: r.status_code, responseNotes: r.response_notes ?? '',
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setErrors({});
    try {
      await api(`/api/patients/${patientId}/referrals`, { body: draft });
      toast.success('Derivación guardada.');
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
      await api(`/api/patients/${patientId}/referrals/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Derivación eliminada.');
      setToDelete(null);
      load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const stMap = new Map(statuses.map((s) => [s.code, s]));

  if (!rows) return <Spinner />;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="font-semibold">Derivaciones</h2>
        {writable && !offline && <Button size="sm" icon={<Plus className="size-4" />} onClick={openNew}>Nueva derivación</Button>}
      </div>
      {offline && !rows.length ? (
        <EmptyState icon={<CloudOff className="size-6" />} title="Derivaciones no disponibles sin conexión" />
      ) : !rows.length ? (
        <EmptyState icon={<Send className="size-6" />} title="Sin derivaciones" description="Registra aquí las derivaciones del paciente a especialistas o a otros doctores de la clínica." />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
              <span className="w-24 shrink-0 text-sm font-medium">{formatDate(r.referral_date.slice(0, 10))}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {r.is_internal ? (r.to_doctor_name ?? r.referred_to_name) : r.referred_to_name}
                  {r.specialty_name && <span className="font-normal text-muted"> · {r.specialty_name}</span>}
                  {!!r.is_internal && <span className="ml-2 text-xs font-normal text-muted">(interna)</span>}
                </p>
                <p className="line-clamp-2 text-muted">{r.reason}</p>
                {r.from_doctor_name && <p className="text-xs text-subtle">Deriva: {r.from_doctor_name}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <Badge color={r.status_color ?? stMap.get(r.status_code)?.value}>{r.status_name}</Badge>
                <Link href={`/app/patients/${patientId}/referrals/${r.id}/print`} aria-label="Imprimir hoja de derivación" title="Imprimir hoja de derivación">
                  <Button variant="ghost" size="sm" icon={<Printer className="size-4" />} />
                </Link>
                {writable && <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => openEdit(r)} aria-label="Editar" />}
                {writable && <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setToDelete(r)} aria-label="Eliminar" />}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={rows.some((r) => r.id === draft?.id) ? 'Editar derivación' : 'Nueva derivación'} size="lg"
        footer={<>
          {draft && rows.some((r) => r.id === draft.id) && (
            <Link href={`/app/patients/${patientId}/referrals/${draft.id}/print`} className="mr-auto">
              <Button variant="ghost" icon={<Printer className="size-4" />}>Imprimir hoja de derivación</Button>
            </Link>
          )}
          <Button variant="secondary" onClick={() => setDraft(null)}>Cancelar</Button>
          <Button onClick={save} loading={saving}>Guardar</Button>
        </>}>
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input type="date" label="Fecha" required value={draft.referralDate} onChange={(e) => set('referralDate', e.target.value)} error={errors.referralDate} />
            <Select label="Doctor que deriva" placeholder="—" value={draft.fromDoctorId} onChange={(e) => set('fromDoctorId', e.target.value)}
              options={doctorOptions} error={errors.fromDoctorId} />
            <Select label="Especialidad" placeholder="—" value={draft.specialtyId} onChange={(e) => set('specialtyId', e.target.value)}
              options={specialties.map((s) => ({ value: s.id, label: s.name }))} error={errors.specialtyId} />
            <Select label="Estado" value={draft.statusCode} onChange={(e) => set('statusCode', e.target.value)}
              options={statuses.map((s) => ({ value: s.code, label: s.name }))} error={errors.statusCode} />
            <div className="sm:col-span-2">
              <Checkbox label="Derivación interna (a un doctor de esta clínica)" checked={draft.isInternal} onChange={(v) => set('isInternal', v)} />
            </div>
            {draft.isInternal ? (
              <Select label="Derivar a" required placeholder="Selecciona un doctor" className="sm:col-span-2" value={draft.toDoctorId}
                onChange={(e) => set('toDoctorId', e.target.value)} options={doctorOptions.filter((d) => d.value !== draft.fromDoctorId)} error={errors.toDoctorId} />
            ) : (
              <>
                <Input label="Especialista o clínica" required maxLength={200} value={draft.referredToName}
                  onChange={(e) => set('referredToName', e.target.value)} error={errors.referredToName} placeholder="Dr. Juan Pérez - Centro de Cirugía Maxilofacial" />
                <Input label="Contacto" maxLength={200} value={draft.referredToContact}
                  onChange={(e) => set('referredToContact', e.target.value)} error={errors.referredToContact} placeholder="Teléfono, correo o dirección" />
              </>
            )}
            <Textarea label="Motivo de la derivación" required className="sm:col-span-2" maxLength={4000} value={draft.reason}
              onChange={(e) => set('reason', e.target.value)} error={errors.reason} />
            <Textarea label="Hallazgos / notas clínicas" className="sm:col-span-2" maxLength={8000} value={draft.clinicalNotes}
              onChange={(e) => set('clinicalNotes', e.target.value)} error={errors.clinicalNotes} hint="Diagnóstico presuntivo, exámenes realizados, tratamiento previo, etc." />
            <Textarea label="Respuesta del especialista" className="sm:col-span-2" maxLength={8000} value={draft.responseNotes}
              onChange={(e) => set('responseNotes', e.target.value)} error={errors.responseNotes} hint="Contrarreferencia o resultado de la atención." />
          </div>
        )}
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar derivación" size="sm"
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar la derivación del {toDelete ? formatDate(toDelete.referral_date.slice(0, 10)) : ''}?</p>
      </Modal>
    </Card>
  );
}
