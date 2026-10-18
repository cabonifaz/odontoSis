'use client';
import { useState } from 'react';
import { Baby, Handshake, ShieldAlert, UserRound } from 'lucide-react';
import { Button, Checkbox, cx, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useAgreements, useApp, useMasters } from '@/lib/client/app-context';
import { ApiError, fieldErrors } from '@/lib/client/api';
import { Combo, PatientPicker } from '@/components/pickers';
import type { LAgreement } from '@/lib/client/offline-db';
import { isMinor, patientSchema, type PatientInput } from '@/lib/shared/schemas';
import { ageFrom } from '@/lib/shared/format';

export type PatientFormValue = Partial<PatientInput> & { id: string; recordNumber?: string | null };

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Alta/edición de paciente. Funciona offline (se encola y se sincroniza al reconectar). */
export function PatientForm({ initial, onSaved, onCancel }: { initial: PatientFormValue; onSaved: (id: string, queued: boolean) => void; onCancel?: () => void }) {
  const { submit } = useApp();
  const toast = useToast();
  const docTypes = useMasters('DOC_TYPE');
  const sexes = useMasters('SEX');
  const relationships = useMasters('GUARDIAN_RELATIONSHIP');
  const agreements = useAgreements();
  // convenios vigentes + el ya asignado (aunque haya vencido) para no perderlo al editar
  const agreementOptions = agreements;
  const [v, setV] = useState<Record<string, string>>(() => ({
    docTypeId: s(initial.docTypeId), docNumber: s(initial.docNumber), firstName: s(initial.firstName), lastName: s(initial.lastName),
    birthDate: s(initial.birthDate), sexId: s(initial.sexId), phone: s(initial.phone), email: s(initial.email), address: s(initial.address),
    insuranceCompany: s(initial.insuranceCompany), deductible: s(initial.deductible), coinsurancePct: s(initial.coinsurancePct),
    allergies: s(initial.allergies), medicalHistory: s(initial.medicalHistory), notes: s(initial.notes),
    guardianName: s(initial.guardianName), guardianRelationshipId: s(initial.guardianRelationshipId), guardianDocTypeId: s(initial.guardianDocTypeId),
    guardianDocNumber: s(initial.guardianDocNumber), guardianPhone: s(initial.guardianPhone), guardianEmail: s(initial.guardianEmail),
    agreementId: s(initial.agreementId), agreementMemberCode: s(initial.agreementMemberCode),
  }));
  const [active, setActive] = useState(initial.isActive ?? true);
  const [hasAgreement, setHasAgreement] = useState(!!initial.agreementId);
  /** Convenio escrito que no existe: se crea al guardar (SP) */
  const [newAgreement, setNewAgreement] = useState<string | null>(null);
  // "Requiere apoderado" manual (adultos) o "menor de edad" rápido sin fecha de nacimiento
  const [requiresGuardian, setRequiresGuardian] = useState(!!initial.requiresGuardian);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const minor = isMinor(v.birthDate || null);
  const age = ageFrom(v.birthDate || null);
  const guardianOn = minor || requiresGuardian;

  /** Botón rápido: marca como menor y lleva el foco al apoderado */
  function quickMinor() {
    setRequiresGuardian(true);
    if (!v.guardianRelationshipId) setV((p) => ({ ...p, guardianRelationshipId: relationships.find((r) => r.code === 'MOTHER')?.id ?? '' }));
    setTimeout(() => document.getElementById('guardian-name')?.focus(), 50);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasAgreement && !v.agreementId && !newAgreement) {
      setErrors({ agreementId: 'Escribe el nombre del convenio' });
      toast.error('Escribe el nombre del convenio o desmarca "Tiene convenio".');
      return;
    }
    const parsed = patientSchema.safeParse({ ...v, id: initial.id, isActive: active, requiresGuardian: guardianOn,
      agreementName: hasAgreement && !v.agreementId ? newAgreement : null });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      toast.error(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const p = parsed.data;
      const { queued } = await submit({ type: 'patient.save', payload: p }, `Paciente ${p.firstName} ${p.lastName}`, async (db) => {
        const prev = await db.patients.get(p.id);
        await db.patients.put({
          id: p.id, record_number: prev?.record_number ?? initial.recordNumber ?? null, first_name: p.firstName, last_name: p.lastName,
          birth_date: p.birthDate ?? null, phone: p.phone ?? null, insurance_company: p.insuranceCompany ?? null,
          deductible: p.deductible ?? null, coinsurance_pct: p.coinsurancePct ?? null, is_active: p.isActive ? 1 : 0,
          requires_guardian: p.requiresGuardian ? 1 : 0, guardian_name: p.requiresGuardian ? p.guardianName ?? null : null,
          guardian_relationship_name: relationships.find((r) => r.id === p.guardianRelationshipId)?.name ?? null,
          guardian_phone: p.requiresGuardian ? p.guardianPhone ?? null : null,
          agreement_id: p.agreementId ?? null, agreement_member_code: p.agreementMemberCode ?? null,
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

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <section className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombres" value={v.firstName} onChange={set('firstName')} error={errors.firstName} required autoFocus />
        <Input label="Apellidos" value={v.lastName} onChange={set('lastName')} error={errors.lastName} required />
        <Select label="Tipo de documento" value={v.docTypeId} onChange={set('docTypeId')} placeholder="—" options={docTypes.map((d) => ({ value: d.id, label: d.name }))} />
        <Input label="N° de documento" value={v.docNumber} onChange={set('docNumber')} error={errors.docNumber} hint="Se almacena cifrado" />
        <div className="flex flex-col gap-1.5">
          <Input label="Fecha de nacimiento" type="date" value={v.birthDate} onChange={set('birthDate')} error={errors.birthDate}
            hint={age !== null ? `${age} año${age === 1 ? '' : 's'}${minor ? ' · menor de edad' : ''}` : undefined} />
          {!guardianOn && (
            <button type="button" onClick={quickMinor} className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-brand hover:text-brand">
              <Baby className="size-3.5" /> Es menor de edad
            </button>
          )}
        </div>
        <Select label="Sexo" value={v.sexId} onChange={set('sexId')} placeholder="—" options={sexes.map((d) => ({ value: d.id, label: d.name }))} />
        <Input label="Teléfono" type="tel" value={v.phone} onChange={set('phone')} error={errors.phone} hint={guardianOn ? 'Opcional si se registra el teléfono del apoderado' : undefined} />
        <Input label="Correo" type="email" value={v.email} onChange={set('email')} error={errors.email} />
        <Input label="Dirección" value={v.address} onChange={set('address')} className="sm:col-span-2" />
      </section>

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
                onChange={(g) => g && setV((p) => ({ ...p, guardianName: `${g.first_name} ${g.last_name}`, guardianPhone: g.phone ?? p.guardianPhone }))} />
            </div>
            <Input id="guardian-name" label="Nombre completo del apoderado" required value={v.guardianName} onChange={set('guardianName')} error={errors.guardianName} />
            <Select label="Parentesco" required value={v.guardianRelationshipId} onChange={set('guardianRelationshipId')} error={errors.guardianRelationshipId}
              placeholder="—" options={relationships.map((r) => ({ value: r.id, label: r.name }))} />
            <Select label="Tipo de documento" value={v.guardianDocTypeId} onChange={set('guardianDocTypeId')} placeholder="—" options={docTypes.map((d) => ({ value: d.id, label: d.name }))} />
            <Input label="N° de documento" value={v.guardianDocNumber} onChange={set('guardianDocNumber')} error={errors.guardianDocNumber} />
            <Input label="Teléfono del apoderado" type="tel" value={v.guardianPhone} onChange={set('guardianPhone')} error={errors.guardianPhone} />
            <Input label="Correo del apoderado" type="email" value={v.guardianEmail} onChange={set('guardianEmail')} error={errors.guardianEmail} />
          </div>
        )}
      </section>

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
              items={agreementOptions} value={v.agreementId || null}
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
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted">Seguro</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Compañía de seguros" value={v.insuranceCompany} onChange={set('insuranceCompany')} />
          <Input label="Deducible por pieza" type="number" min="0" step="0.01" value={v.deductible} onChange={set('deductible')} error={errors.deductible} />
          <Input label="Coaseguro %" type="number" min="0" max="100" step="0.01" value={v.coinsurancePct} onChange={set('coinsurancePct')} error={errors.coinsurancePct} />
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold text-muted">Información clínica (confidencial)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea label="Alergias" value={v.allergies} onChange={set('allergies')} />
          <Textarea label="Antecedentes médicos" value={v.medicalHistory} onChange={set('medicalHistory')} />
          <Textarea label="Notas" value={v.notes} onChange={set('notes')} className="sm:col-span-2" />
        </div>
      </section>
      <Checkbox label="Paciente activo" checked={active} onChange={setActive} />
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" loading={saving}>Guardar</Button>
      </div>
    </form>
  );
}
