'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, ClipboardPlus, CloudOff, Lock, Pencil, ShieldAlert, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Spinner, Tabs } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useFormMode, useMasters, can } from '@/lib/client/app-context';
import { PatientFilesTab } from '@/components/patients/patient-files-tab';
import { ReferralsTab } from '@/components/patients/referrals-tab';
import { GuaranteeLettersTab } from '@/components/patients/guarantee-letters-tab';
import { OrthoBudgetsTab } from '@/components/patients/ortho-budgets-tab';
import { DependentsTab } from '@/components/patients/dependents-tab';
import { ClinicalNotesTab } from '@/components/patients/clinical-notes-tab';
import { ConsentsTab } from '@/components/patients/consents-tab';
import { api, ApiError } from '@/lib/client/api';
import { PatientForm, type PatientFormValue } from '@/components/patients/patient-form';
import { Odontogram, OdontogramLegend, toConditions, type Mark } from '@/components/odontogram/odontogram';
import { ConditionPalette, toggleMark } from '@/components/odontogram/condition-palette';
import { ageFrom, formatDate, formatDateTime, formatMoney } from '@/lib/shared/format';

type Full = PatientFormValue & {
  recordNumber: string; createdAt: string; updatedAt: string; guardianRelationshipName: string | null; guardianDocTypeCode: string | null;
  agreementName: string | null; agreementDiscountPct: number | null;
  districtName: string | null; provinceName: string | null; departmentName: string | null; homeBranchName: string | null;
  assignedDoctorName: string | null; attentionTypeName: string | null; priceListName: string | null; priceListGroup: string | null;
  titularName: string | null; titularRecordNumber: string | null; titularRelationshipName: string | null;
  consentStatus: 'OK' | 'PARTIAL' | 'MISSING';
};
type Tab = 'datos' | 'historia' | 'dependientes' | 'derivaciones' | 'citas' | 'archivos' | 'odontograma' | 'presupuestos' | 'ortodoncia' | 'garantias' | 'consentimientos';
const TABS: Tab[] = ['datos', 'historia', 'dependientes', 'derivaciones', 'citas', 'archivos', 'odontograma', 'presupuestos', 'ortodoncia', 'garantias', 'consentimientos'];

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const { db, session } = useApp();
  const router = useRouter();
  const toast = useToast();
  const qTab = useSearchParams().get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(qTab && TABS.includes(qTab) ? qTab : 'datos');
  const [full, setFull] = useState<Full | null>(null);
  const [offline, setOffline] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const local = useLiveQuery(async () => db?.patients.get(id), [db, id]);
  const writable = can(session, 'patients.write');
  const mode = useFormMode(local?.home_branch_id ?? null);
  const maritalStatuses = useMasters('MARITAL_STATUS');
  const acquisitionSources = useMasters('ACQUISITION_SOURCE');

  const load = useCallback(() => {
    api<Full>(`/api/patients/${id}`).then((p) => { setFull(p); setOffline(false); })
      .catch((e) => { if (e instanceof ApiError && e.isNetwork) setOffline(true); else if (e instanceof ApiError && e.status === 404) { setFull(null); setNotFound(true); } });
  }, [id]);
  useEffect(load, [load]);

  const name = full ? [full.firstName, full.lastName, full.motherLastName].filter(Boolean).join(' ')
    : local ? [local.first_name, local.last_name, local.mother_last_name].filter(Boolean).join(' ') : '';
  if (!full && !local && notFound) return <Card><EmptyState title="Paciente no encontrado" description="Puede haber sido eliminado o pertenecer a otra clínica." action={<Link href="/app/patients"><Button variant="secondary">Ir a pacientes</Button></Link>} /></Card>;
  if (!full && !local) return offline ? <Card><EmptyState icon={<CloudOff className="size-6" />} title="Paciente no disponible sin conexión" /></Card> : <Spinner />;

  async function remove() {
    try {
      await api(`/api/patients/${id}`, { method: 'DELETE' });
      await db?.patients.delete(id);
      toast.success('Paciente eliminado.');
      router.replace('/app/patients');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  const age = ageFrom(full?.birthDate ?? local?.birth_date);
  return (
    <>
      <PageHeader
        title={name}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <span className="font-mono">H.C. {full?.recordNumber ?? local?.record_number ?? 'pendiente'}</span>
          {age !== null && <span>· {age} años</span>}
          {age !== null && age < 18 && <Badge color="var(--accent)">Menor de edad</Badge>}
          {(full?.requiresGuardian ?? !!local?.requires_guardian) && <Badge color="var(--info)">Apoderado: {full?.guardianName ?? local?.guardian_name}</Badge>}
          <span>· {(full?.insuranceCompany ?? local?.insurance_company) || 'Particular'}</span>
          {local?.pending && <Badge color="var(--warning)">Pendiente de sincronizar</Badge>}
          {(full ? full.consentStatus !== 'OK' : !!local && local.consent_status !== 'OK' && !local.pending) && (
            <button type="button" onClick={() => setTab('consentimientos')} className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-white hover:opacity-90">
              <ShieldAlert className="size-3.5" aria-hidden /> {(full?.consentStatus ?? local?.consent_status) === 'PARTIAL' ? 'Falta un consentimiento' : 'Faltan consentimientos'}
            </button>
          )}
        </span>}
        actions={<>
          {can(session, 'appointments.write') && <Link href={`/app/agenda?new=1&patientId=${id}`}><Button variant="secondary" icon={<CalendarPlus className="size-4" />}>Agendar cita</Button></Link>}
          {can(session, 'budgets.write') && <Link href={`/app/budgets/new?patientId=${id}`}><Button icon={<ClipboardPlus className="size-4" />}>Presupuesto</Button></Link>}
        </>}
      />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={mode === 'ADVANCED' ? [
        { value: 'datos', label: 'Datos personales' }, { value: 'historia', label: 'Historia clínica' }, { value: 'dependientes', label: 'Dependientes' },
        { value: 'derivaciones', label: 'Derivaciones' }, { value: 'citas', label: 'Citas' },
        { value: 'archivos', label: 'Imágenes y archivos' }, { value: 'odontograma', label: 'Odontograma' },
        { value: 'presupuestos', label: 'Presupuestos operatorias' }, { value: 'ortodoncia', label: 'Presupuestos de ortodoncia' },
        { value: 'garantias', label: 'Carta de garantía' }, { value: 'consentimientos', label: 'Consentimientos' },
      ] : [
        { value: 'datos', label: 'Datos' }, { value: 'historia', label: 'Historia clínica' }, { value: 'odontograma', label: 'Odontograma' },
        { value: 'presupuestos', label: 'Presupuestos' }, { value: 'citas', label: 'Citas' },
        { value: 'archivos', label: 'Imágenes y archivos' }, { value: 'consentimientos', label: 'Consentimientos' },
      ]} />

      {tab === 'datos' && (
        <Card className="p-5 sm:p-6">
          {!full ? (
            <p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" /> La ficha completa (datos sensibles) sólo se muestra con conexión.</p>
          ) : editing ? (
            <PatientForm initial={full} onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Item k="Documento" v={full.docNumber} />
                {full.homeBranchName && <Item k="Sede" v={full.homeBranchName} />}
                {mode === 'ADVANCED' && (
                  <>
                    <Item k="Celular" v={full.mobile} />
                    <Item k="Mensajería" v={full.messaging} />
                    <Item k="Estado civil" v={maritalStatuses.find((m) => m.id === full.maritalStatusId)?.name} />
                    <Item k="Captación" v={acquisitionSources.find((m) => m.id === full.acquisitionSourceId)?.name} />
                    <Item k="N° de carnet" v={full.cardNumber} />
                    <Item k="Ubigeo" v={[full.departmentName, full.provinceName, full.districtName].filter(Boolean).join(' / ') || null} />
                    <Item k="Doctor asignado" v={full.assignedDoctorName} />
                    <Item k="Asignación" v={full.attentionTypeName} />
                    <Item k="Plan (tarifario)" v={full.priceListName ? `${full.priceListGroup ? `${full.priceListGroup} · ` : ''}${full.priceListName}` : null} />
                    {full.titularName && <Item k="Titular" v={`${full.titularName} (H.C. ${full.titularRecordNumber})${full.titularRelationshipName ? ` · ${full.titularRelationshipName}` : ''}`} />}
                  </>
                )}
                <Item k="Fecha de nacimiento" v={full.birthDate ? formatDate(full.birthDate) : null} />
                <Item k="Teléfono" v={full.phone} />
                <Item k="Correo" v={full.email} />
                <Item k="Dirección" v={full.address} />
                <Item k="Convenio" v={full.agreementName ? `${full.agreementName} (${Number(full.agreementDiscountPct)} %)${full.agreementMemberCode ? ` · Socio N° ${full.agreementMemberCode}` : ''}` : 'Sin convenio'} />
                <Item k="Seguro" v={full.insuranceCompany ? `${full.insuranceCompany} · Deducible ${formatMoney(Number(full.deductible ?? 0), session.tenant!.currencySymbol)} · Coaseguro ${full.coinsurancePct ?? 0}%` : 'Particular'} />
                {full.requiresGuardian && (
                  <div className="rounded-control border border-line bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
                    <dt className="mb-1 font-semibold">Apoderado</dt>
                    <dd className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                      <span>{full.guardianName} {full.guardianRelationshipName && <span className="text-muted">({full.guardianRelationshipName})</span>}</span>
                      <span>{full.guardianDocNumber ? `${full.guardianDocTypeCode ?? ''} ${full.guardianDocNumber}` : '—'}</span>
                      <span>{full.guardianPhone || '—'}</span>
                      <span>{full.guardianEmail || '—'}</span>
                    </dd>
                  </div>
                )}
                <Item k="Alergias" v={full.allergies} wide />
                <Item k="Antecedentes" v={full.medicalHistory} wide />
                <Item k="Notas" v={full.notes} wide />
              </dl>
              <p className="mt-6 text-xs text-subtle">Registrado {formatDateTime(full.createdAt)} · Actualizado {formatDateTime(full.updatedAt)}</p>
              {writable && (
                <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Editar</Button>
                  <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDel(true)}>Eliminar</Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}
      {tab === 'historia' && <ClinicalNotesTab patientId={id} medicalHistory={full?.medicalHistory} allergies={full?.allergies} />}
      {tab === 'odontograma' && <PatientOdontogram patientId={id} writable={writable} />}
      {tab === 'presupuestos' && <PatientBudgets patientId={id} />}
      {tab === 'citas' && <PatientAppointments patientId={id} />}
      {tab === 'archivos' && <PatientFilesTab patientId={id} writable={writable} />}
      {tab === 'dependientes' && <DependentsTab patientId={id} />}
      {tab === 'derivaciones' && <ReferralsTab patientId={id} writable={writable} />}
      {tab === 'ortodoncia' && <OrthoBudgetsTab patientId={id} />}
      {tab === 'garantias' && <GuaranteeLettersTab patientId={id} writable={writable} />}
      {tab === 'consentimientos' && (
        <ConsentsTab patientId={id} onChanged={load} patient={full ? {
          name: [full.firstName, full.lastName, full.motherLastName].filter(Boolean).join(' '), docNumber: full.docNumber ?? null, docTypeId: full.docTypeId ?? null,
          birthDate: full.birthDate ?? null, requiresGuardian: !!full.requiresGuardian, guardianName: full.guardianName ?? null,
          guardianDocNumber: full.guardianDocNumber ?? null, guardianDocTypeId: full.guardianDocTypeId ?? null, guardianRelationshipId: full.guardianRelationshipId ?? null,
        } : null} />
      )}

      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Eliminar paciente" size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmDel(false)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar a <strong>{name}</strong>? El registro se conserva en la auditoría y puede recuperarse por soporte.</p>
      </Modal>
    </>
  );
}

function Item({ k, v, wide }: { k: string; v: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <dt className="text-muted">{k}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{v || '—'}</dd>
    </div>
  );
}

function PatientOdontogram({ patientId, writable }: { patientId: string; writable: boolean }) {
  const toast = useToast();
  const conditions = toConditions(useMasters('TOOTH_CONDITION'));
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ marks: { tooth_code: string; surface: Mark['surface']; condition_id: string }[] }>(`/api/patients/${patientId}/odontogram`)
      .then((r) => setMarks(r.marks.map((m) => ({ toothCode: m.tooth_code, surface: m.surface, conditionId: m.condition_id }))))
      .catch(() => setMarks([]));
  }, [patientId]);
  useEffect(() => { if (!tool && conditions[0]) setTool(conditions[0].id); }, [conditions, tool]);

  const apply = (tooth: string, surface: Mark['surface']) => {
    const c = conditions.find((x) => x.id === tool);
    if (!c || !marks) return;
    setMarks(toggleMark(marks, c, tooth, surface));
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    try {
      await api(`/api/patients/${patientId}/odontogram`, { method: 'PUT', body: { marks } });
      setDirty(false);
      toast.success('Odontograma guardado.');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  if (!marks) return <Spinner />;
  return (
    <Card className="p-4 sm:p-6">
      {writable && <div className="mb-4"><ConditionPalette conditions={conditions} value={tool} onChange={setTool} /></div>}
      <div className="overflow-x-auto"><Odontogram marks={marks} conditions={conditions} readOnly={!writable} onSurfaceClick={apply} onToothClick={(t) => apply(t, null)} /></div>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <OdontogramLegend conditions={conditions} />
        {writable && <Button onClick={save} loading={saving} disabled={!dirty}>Guardar odontograma</Button>}
      </div>
    </Card>
  );
}

function PatientBudgets({ patientId }: { patientId: string }) {
  const { db, session } = useApp();
  const statuses = useMasters('BUDGET_STATUS');
  const rows = useLiveQuery(async () => db?.budgets.where('patient_id').equals(patientId).reverse().sortBy('budget_date'), [db, patientId]);
  const st = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);
  if (!rows) return <Spinner />;
  if (!rows.length) return <Card><EmptyState title="Sin presupuestos" /></Card>;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map((b) => (
          <li key={b.id}>
            <Link href={`/app/budgets/${b.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2">
              <span className="font-mono text-xs text-muted">N° {b.budget_number ?? '—'}</span>
              <span className="flex-1 text-sm">{formatDate(b.budget_date)}</span>
              <span className="font-medium tabular-nums">{formatMoney(b.total, session.tenant!.currencySymbol)}</span>
              <Badge color={st.get(b.status_code)?.value}>{st.get(b.status_code)?.name ?? b.status_code}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PatientAppointments({ patientId }: { patientId: string }) {
  const { db, session } = useApp();
  const statuses = useMasters('APPOINTMENT_STATUS');
  const rows = useLiveQuery(async () => db?.appointments.where('patient_id').equals(patientId).reverse().sortBy('start_at'), [db, patientId]);
  const doctors = useLiveQuery(async () => db?.doctors.toArray(), [db]);
  const st = new Map(statuses.map((s) => [s.code, s]));
  const dr = new Map((doctors ?? []).map((d) => [d.id, `${d.first_name} ${d.last_name}`]));
  if (!rows) return <Spinner />;
  if (!rows.length) return <Card><EmptyState title="Sin citas registradas" /></Card>;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="w-40 font-medium">{formatDateTime(a.start_at, session.tenant!.timezone)}</span>
            <span className="flex-1 text-muted">{dr.get(a.doctor_id) ?? ''}{a.reason ? ` · ${a.reason}` : ''}</span>
            <Badge color={st.get(a.status_code)?.value}>{st.get(a.status_code)?.name ?? a.status_code}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
