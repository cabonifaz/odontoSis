'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Baby, Handshake, ShieldAlert, UserRound } from 'lucide-react';
import { Button, Checkbox, cx, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useAgreements, useApp, useBranches, useFormMode, useMasters, usePriceLists } from '@/lib/client/app-context';
import { ApiError, fieldErrors } from '@/lib/client/api';
import { Combo, PatientPicker } from '@/components/pickers';
import { DocumentNumberInput } from '@/components/dni-lookup';
import { UbigeoPicker } from '@/components/ubigeo-picker';
import type { LAgreement } from '@/lib/client/offline-db';
import { isMinor, patientSchema, type PatientInput } from '@/lib/shared/schemas';
import { ageFrom } from '@/lib/shared/format';

export type PatientFormValue = Partial<PatientInput> & { id: string; recordNumber?: string | null };

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Alta/edición de paciente. Funciona offline (se encola y se sincroniza al reconectar).
 * Ficha ESTÁNDAR (clínica pequeña) o AVANZADA (clínica grande) según la configuración de la clínica o de la sede.
 */
export function PatientForm({ initial, onSaved, onCancel }: { initial: PatientFormValue; onSaved: (id: string, queued: boolean) => void; onCancel?: () => void }) {
  const { submit, db } = useApp();
  const toast = useToast();
  const docTypes = useMasters('DOC_TYPE');
  const sexes = useMasters('SEX');
  const relationships = useMasters('GUARDIAN_RELATIONSHIP');
  const maritalStatuses = useMasters('MARITAL_STATUS');
  const acquisitionSources = useMasters('ACQUISITION_SOURCE');
  const attentionTypes = useMasters('ATTENTION_TYPE');
  const agreements = useAgreements();
  const branches = useBranches();
  const priceLists = usePriceLists();
  const doctors = useLiveQuery(async () => (db ? (await db.doctors.toArray()).filter((d) => d.is_active) : []), [db]) ?? [];

  const [v, setV] = useState<Record<string, string>>(() => ({
    docTypeId: s(initial.docTypeId), docNumber: s(initial.docNumber), firstName: s(initial.firstName), lastName: s(initial.lastName),
    motherLastName: s(initial.motherLastName),
    birthDate: s(initial.birthDate), sexId: s(initial.sexId), phone: s(initial.phone), mobile: s(initial.mobile), messaging: s(initial.messaging),
    email: s(initial.email), address: s(initial.address),
    maritalStatusId: s(initial.maritalStatusId), acquisitionSourceId: s(initial.acquisitionSourceId), cardNumber: s(initial.cardNumber),
    homeBranchId: s(initial.homeBranchId), assignedDoctorId: s(initial.assignedDoctorId), attentionTypeId: s(initial.attentionTypeId),
    priceListId: s(initial.priceListId), titularPatientId: s(initial.titularPatientId), titularRelationshipId: s(initial.titularRelationshipId),
    insuranceCompany: s(initial.insuranceCompany), deductible: s(initial.deductible), coinsurancePct: s(initial.coinsurancePct),
    allergies: s(initial.allergies), medicalHistory: s(initial.medicalHistory), notes: s(initial.notes),
    guardianName: s(initial.guardianName), guardianRelationshipId: s(initial.guardianRelationshipId), guardianDocTypeId: s(initial.guardianDocTypeId),
    guardianDocNumber: s(initial.guardianDocNumber), guardianPhone: s(initial.guardianPhone), guardianEmail: s(initial.guardianEmail),
    agreementId: s(initial.agreementId), agreementMemberCode: s(initial.agreementMemberCode),
  }));
  const [districtId, setDistrictId] = useState<string | null>(initial.districtId ?? null);
  const [active, setActive] = useState(initial.isActive ?? true);
  const [hasAgreement, setHasAgreement] = useState(!!initial.agreementId);
  /** Convenio escrito que no existe: se crea al guardar (SP) */
  const [newAgreement, setNewAgreement] = useState<string | null>(null);
  // "Requiere apoderado" manual (adultos) o "menor de edad" rápido sin fecha de nacimiento
  const [requiresGuardian, setRequiresGuardian] = useState(!!initial.requiresGuardian);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  // La ficha depende de la sede del paciente (o la principal)
  const mode = useFormMode(v.homeBranchId || null);
  const advanced = mode === 'ADVANCED';
  const minor = isMinor(v.birthDate || null);
  const age = ageFrom(v.birthDate || null);
  const guardianOn = minor || requiresGuardian;
  const docTypeCode = docTypes.find((d) => d.id === v.docTypeId)?.code;
  const guardianDocCode = docTypes.find((d) => d.id === v.guardianDocTypeId)?.code;
  const defaultDocType = docTypes.find((d) => d.code === 'DNI')?.id ?? '';

  // Tarifarios agrupados por "tipo de plan"
  const planGroups = useMemo(() => [...new Set(priceLists.map((l) => l.group_name || 'Tarifario general'))], [priceLists]);
  const [planGroup, setPlanGroup] = useState<string>(() => '');
  const currentGroup = planGroup || priceLists.find((l) => l.id === v.priceListId)?.group_name || planGroups[0] || '';
  const plansInGroup = priceLists.filter((l) => (l.group_name || 'Tarifario general') === currentGroup && (!l.branch_id || !v.homeBranchId || l.branch_id === v.homeBranchId));

  /** Botón rápido: marca como menor y lleva el foco al apoderado */
  const wantMother = useRef(false);
  function quickMinor() {
    setRequiresGuardian(true);
    if (!v.guardianRelationshipId) {
      const mother = relationships.find((r) => r.code === 'MOTHER')?.id;
      if (mother) setV((p) => ({ ...p, guardianRelationshipId: mother }));
      else wantMother.current = true; // catálogos aún sincronizando (primer ingreso): se completa al llegar
    }
    setTimeout(() => document.getElementById('guardian-name')?.focus(), 50);
  }

  useEffect(() => {
    if (!wantMother.current) return;
    const mother = relationships.find((r) => r.code === 'MOTHER')?.id;
    if (!mother) return;
    wantMother.current = false;
    setV((p) => (p.guardianRelationshipId ? p : { ...p, guardianRelationshipId: mother }));
  }, [relationships]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasAgreement && !v.agreementId && !newAgreement) {
      setErrors({ agreementId: 'Escribe el nombre del convenio' });
      toast.error('Escribe el nombre del convenio o desmarca "Tiene convenio".');
      return;
    }
    const values = {
      ...v, id: initial.id, isActive: active, requiresGuardian: guardianOn, formMode: mode, districtId,
      docTypeId: v.docTypeId || (advanced ? defaultDocType : ''),
      priceListId: v.priceListId || (advanced ? '' : null),
      agreementName: hasAgreement && !v.agreementId ? newAgreement : null,
    };
    const parsed = patientSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      toast.error(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const p = parsed.data;
      const { queued } = await submit({ type: 'patient.save', payload: p }, `Paciente ${p.firstName} ${p.lastName}`, async (ldb) => {
        const prev = await ldb.patients.get(p.id);
        await ldb.patients.put({
          id: p.id, record_number: prev?.record_number ?? initial.recordNumber ?? null, first_name: p.firstName, last_name: p.lastName,
          mother_last_name: p.motherLastName ?? null,
          birth_date: p.birthDate ?? null, phone: p.mobile ?? p.phone ?? null, insurance_company: p.insuranceCompany ?? null,
          deductible: p.deductible ?? null, coinsurance_pct: p.coinsurancePct ?? null, is_active: p.isActive ? 1 : 0,
          requires_guardian: p.requiresGuardian ? 1 : 0, guardian_name: p.requiresGuardian ? p.guardianName ?? null : null,
          guardian_relationship_name: relationships.find((r) => r.id === p.guardianRelationshipId)?.name ?? null,
          guardian_phone: p.requiresGuardian ? p.guardianPhone ?? null : null,
          agreement_id: p.agreementId ?? null, agreement_member_code: p.agreementMemberCode ?? null,
          home_branch_id: p.homeBranchId ?? null, assigned_doctor_id: p.assignedDoctorId ?? null, price_list_id: p.priceListId ?? null,
          titular_patient_id: p.titularPatientId ?? null,
          updated_at: new Date().toISOString(), pending: true,
        });
      });
      toast.success(queued ? 'Guardado sin conexión. Se sincronizará al reconectar.' : 'Paciente guardado.');
      onSaved(p.id, queued);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  const sectionTitle = (t: string) => <h3 className="mb-3 text-sm font-semibold text-muted sm:col-span-full">{t}</h3>;
  const docOptions = docTypes.map((d) => ({ value: d.id, label: d.name }));

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <p className="flex items-center gap-2 text-xs text-muted">
        <span className={cx('rounded-full px-2 py-0.5 font-medium', advanced ? 'bg-brand-soft text-brand' : 'bg-surface-2')}>{advanced ? 'Ficha avanzada' : 'Ficha estándar'}</span>
        {initial.recordNumber && <span>H.C. <span className="font-mono">{initial.recordNumber}</span></span>}
      </p>

      {/* ---------------- Datos personales ---------------- */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {advanced && sectionTitle('Datos personales')}
        {branches.length > 1 && (
          <Select label="Sede" value={v.homeBranchId} onChange={set('homeBranchId')} placeholder="—" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        )}
        <Select label="Tipo de documento" required={advanced} value={v.docTypeId || (advanced ? defaultDocType : '')} onChange={set('docTypeId')} placeholder="—" options={docOptions} />
        <DocumentNumberInput required={advanced} value={v.docNumber} onChange={(x) => setV((p) => ({ ...p, docNumber: x }))} error={errors.docNumber}
          isDni={(docTypeCode ?? (advanced ? 'DNI' : '')) === 'DNI'}
          onFound={(d) => setV((p) => ({
            ...p, firstName: d.firstName, docTypeId: p.docTypeId || defaultDocType,
            lastName: advanced ? d.lastName : [d.lastName, d.motherLastName].filter(Boolean).join(' '),
            motherLastName: advanced ? d.motherLastName : p.motherLastName,
          }))} />
        {advanced ? (
          <>
            <Input label="Apellido paterno" value={v.lastName} onChange={set('lastName')} error={errors.lastName} required />
            <Input label="Apellido materno" value={v.motherLastName} onChange={set('motherLastName')} error={errors.motherLastName} required />
            <Input label="Nombre(s)" value={v.firstName} onChange={set('firstName')} error={errors.firstName} required />
          </>
        ) : (
          <>
            <Input label="Nombres" value={v.firstName} onChange={set('firstName')} error={errors.firstName} required autoFocus />
            <Input label="Apellidos" value={v.lastName} onChange={set('lastName')} error={errors.lastName} required />
          </>
        )}
        <Select label="Sexo" required={advanced} value={v.sexId} onChange={set('sexId')} placeholder="—" options={sexes.map((d) => ({ value: d.id, label: d.name }))} />
        <div className="flex flex-col gap-1.5">
          <Input label="Fecha de nacimiento" type="date" value={v.birthDate} onChange={set('birthDate')} error={errors.birthDate}
            hint={age !== null ? `${age} año${age === 1 ? '' : 's'}${minor ? ' · menor de edad' : ''}` : undefined} />
          {!guardianOn && (
            <button type="button" onClick={quickMinor} className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-brand hover:text-brand">
              <Baby className="size-3.5" /> Es menor de edad
            </button>
          )}
        </div>
        {advanced && <Input label="Celular" type="tel" required value={v.mobile} onChange={set('mobile')} error={errors.mobile} />}
        <Input label="Teléfono" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} hint={!advanced && guardianOn ? 'Opcional si se registra el teléfono del apoderado' : undefined} />
        <Input label="Correo" type="email" value={v.email} onChange={set('email')} error={errors.email} />
        {advanced && (
          <>
            <Select label="Estado civil" value={v.maritalStatusId} onChange={set('maritalStatusId')} placeholder="—" options={maritalStatuses.map((m) => ({ value: m.id, label: m.name }))} />
            <Select label="Captación (¿cómo nos conoció?)" required value={v.acquisitionSourceId} onChange={set('acquisitionSourceId')} error={errors.acquisitionSourceId}
              placeholder="— Seleccione —" options={acquisitionSources.map((m) => ({ value: m.id, label: m.name }))} />
            <Input label="N° de carnet" value={v.cardNumber} onChange={set('cardNumber')} />
            <Input label="N° de mensajería (WhatsApp)" type="tel" value={v.messaging} onChange={set('messaging')} hint="Si es distinto al celular" />
          </>
        )}
        {!advanced && <Input label="Dirección" value={v.address} onChange={set('address')} className="sm:col-span-2" />}
      </section>

      {/* ---------------- Ficha avanzada: dirección, asignación y plan ---------------- */}
      {advanced && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            {sectionTitle('Dirección')}
            <UbigeoPicker value={districtId} onChange={setDistrictId} error={errors.districtId} />
            <Input label="Dirección" value={v.address} onChange={set('address')} className="sm:col-span-3" />
          </section>
          <section className="grid gap-4 sm:grid-cols-2">
            {sectionTitle('Asignación del paciente')}
            <Select label="Doctor" required value={v.assignedDoctorId} onChange={set('assignedDoctorId')} error={errors.assignedDoctorId} placeholder="— Seleccione —"
              options={doctors.map((d) => ({ value: d.id, label: `${d.first_name} ${d.last_name}` }))} />
            <Select label="Asignación (tipo de atención)" required value={v.attentionTypeId} onChange={set('attentionTypeId')} error={errors.attentionTypeId} placeholder="— Seleccione —"
              options={attentionTypes.map((m) => ({ value: m.id, label: m.name }))} />
          </section>
          <section className="grid gap-4 sm:grid-cols-2">
            {sectionTitle('Asignación de plan (tarifario)')}
            <Select label="Tipo de plan" required value={currentGroup} onChange={(e) => { setPlanGroup(e.target.value); setV((p) => ({ ...p, priceListId: '' })); }}
              options={planGroups.map((g) => ({ value: g, label: g }))} />
            <Select label="Elige plan" required value={v.priceListId} onChange={set('priceListId')} error={errors.priceListId} placeholder="— Seleccione —"
              options={plansInGroup.map((l) => ({ value: l.id, label: l.name }))} />
          </section>
          <section className="grid gap-4 sm:grid-cols-2">
            {sectionTitle('Titular (si es dependiente de otro paciente)')}
            <PatientPicker label="Titular" value={v.titularPatientId || null} excludeIds={[initial.id]}
              onChange={(t) => setV((p) => ({ ...p, titularPatientId: t?.id ?? '' }))} />
            {v.titularPatientId && (
              <Select label="Parentesco con el titular" value={v.titularRelationshipId} onChange={set('titularRelationshipId')} placeholder="—"
                options={relationships.map((r) => ({ value: r.id, label: r.name }))} />
            )}
          </section>
        </>
      )}

      {/* ---------------- Apoderado ---------------- */}
      <section className={cx('rounded-card border p-4 transition-colors', guardianOn ? 'border-accent/50 bg-accent/5' : 'border-line')}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserRound className="size-4 text-brand" /> Apoderado
            {minor && <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-fg"><ShieldAlert className="size-3" /> Obligatorio: menor de edad</span>}
          </h3>
          {!minor && <Checkbox label="Requiere apoderado (menor, adulto mayor, discapacidad…)" checked={requiresGuardian} onChange={setRequiresGuardian} />}
        </div>
        {guardianOn && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <PatientPicker label="¿El apoderado ya es paciente? (opcional)" value={null} excludeIds={[initial.id]}
                onChange={(g) => g && setV((p) => ({ ...p, guardianName: [g.first_name, g.last_name, g.mother_last_name].filter(Boolean).join(' '), guardianPhone: g.phone ?? p.guardianPhone }))} />
            </div>
            <Select label="Tipo de documento" value={v.guardianDocTypeId} onChange={set('guardianDocTypeId')} placeholder="—" options={docOptions} />
            <DocumentNumberInput value={v.guardianDocNumber} onChange={(x) => setV((p) => ({ ...p, guardianDocNumber: x }))} error={errors.guardianDocNumber}
              isDni={guardianDocCode === 'DNI'} onFound={(d) => setV((p) => ({ ...p, guardianName: d.fullName }))} />
            <Input id="guardian-name" label="Nombre completo del apoderado" required value={v.guardianName} onChange={set('guardianName')} error={errors.guardianName} />
            <Select label="Parentesco" required value={v.guardianRelationshipId} onChange={set('guardianRelationshipId')} error={errors.guardianRelationshipId}
              placeholder="—" options={relationships.map((r) => ({ value: r.id, label: r.name }))} />
            <Input label="Teléfono del apoderado" type="tel" value={v.guardianPhone} onChange={set('guardianPhone')} error={errors.guardianPhone} />
            <Input label="Correo del apoderado" type="email" value={v.guardianEmail} onChange={set('guardianEmail')} error={errors.guardianEmail} />
          </div>
        )}
      </section>

      {/* ---------------- Convenio ---------------- */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted"><Handshake className="size-4" /> Convenio</h3>
        <Checkbox label="Tiene convenio (empresa o club)" checked={hasAgreement}
          onChange={(on) => { setHasAgreement(on); if (!on) { setNewAgreement(null); setV((p) => ({ ...p, agreementId: '', agreementMemberCode: '' })); } }} />
        {hasAgreement && (
          <div className="mt-3 grid gap-4 sm:grid-cols-[2fr_1fr]">
            {/* Se escribe el nombre: si existe se elige (sin duplicados); si no, se crea automáticamente al guardar */}
            {newAgreement ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Convenio <span className="text-danger">*</span></span>
                <div className="flex h-10 items-center justify-between rounded-control border border-brand bg-brand-soft px-3 text-sm">
                  <span className="truncate"><strong>{newAgreement}</strong> <span className="text-muted">· nuevo, se registrará al guardar</span></span>
                  <button type="button" aria-label="Quitar" onClick={() => setNewAgreement(null)} className="text-muted hover:text-fg">✕</button>
                </div>
              </div>
            ) : (
              <Combo<LAgreement>
                label="Convenio" required error={errors.agreementId}
                items={agreements} value={v.agreementId || null}
                placeholder="Escribe el nombre del convenio o la empresa"
                onChange={(a) => setV((p) => ({ ...p, agreementId: a?.id ?? '' }))}
                text={(a) => `${a.name} ${a.company_name ?? ''} ${a.code}`}
                render={(a) => (
                  <span className="flex justify-between gap-3">
                    <span className="truncate">{a.name}{a.company_name ? <span className="text-muted"> · {a.company_name}</span> : null}</span>
                    <span className="shrink-0 tabular-nums text-muted">{Number(a.discount_pct)} %</span>
                  </span>
                )}
                emptyText="Escribe al menos 2 letras"
                onCreate={(name) => { setNewAgreement(name); setV((p) => ({ ...p, agreementId: '' })); }}
                createLabel={(t) => `Crear convenio «${t}»`}
                exactText={(a) => a.name}
              />
            )}
            <Input label="N° de socio / carnet (opcional)" value={v.agreementMemberCode} onChange={set('agreementMemberCode')} error={errors.agreementMemberCode} />
          </div>
        )}
      </section>

      {/* ---------------- Seguro ---------------- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted">Seguro</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Compañía de seguros" value={v.insuranceCompany} onChange={set('insuranceCompany')} />
          <Input label="Deducible por pieza" type="number" min="0" step="0.01" value={v.deductible} onChange={set('deductible')} error={errors.deductible} />
          <Input label="Coaseguro %" type="number" min="0" max="100" step="0.01" value={v.coinsurancePct} onChange={set('coinsurancePct')} error={errors.coinsurancePct} />
        </div>
      </section>

      {/* ---------------- Clínica ---------------- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted">Información clínica (confidencial)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea label="Alergias" value={v.allergies} onChange={set('allergies')} />
          <Textarea label="Antecedentes médicos" value={v.medicalHistory} onChange={set('medicalHistory')} />
          <Textarea label={advanced ? 'Observación' : 'Notas'} value={v.notes} onChange={set('notes')} className="sm:col-span-2" />
        </div>
      </section>
      <Checkbox label="Paciente activo" checked={active} onChange={setActive} />
      <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" loading={saving}>Guardar</Button>
      </div>
    </form>
  );
}
