'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CloudOff, ExternalLink, FileSignature, Printer, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { Badge, Button, Card, Checkbox, cx, EmptyState, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { useApp, useMasters, can } from '@/lib/client/app-context';
import { ageFrom, todayIn } from '@/lib/shared/format';
import { CONSENT_LABELS, consentDate } from './consent-documents';

type Consent = {
  id: string; type_code: string; type_name: string; form_version: string; signer_type: 'PATIENT' | 'GUARDIAN'; signer_name: string;
  signer_doc_type_code: string | null; signer_doc_number: string | null; signer_relationship_name: string | null; signed_on: string;
  marketing_opt_in: number | null; file_id: string | null; file_mime: string | null; status: 'ACTIVE' | 'REPLACED' | 'REVOKED';
  revoked_on: string | null; revoke_reason: string | null; notes: string | null; created_at: string; created_by_name: string | null;
};
export type ConsentPatient = {
  name: string; docNumber: string | null; docTypeId: string | null; birthDate: string | null; requiresGuardian: boolean;
  guardianName: string | null; guardianDocNumber: string | null; guardianDocTypeId: string | null; guardianRelationshipId: string | null;
};
const TYPES = ['DATA_PROTECTION', 'MEDICAL_CONFIDENTIALITY'] as const;

/** Consentimientos del paciente: estado, formato para imprimir, registro del firmado, historial y revocación */
export function ConsentsTab({ patientId, patient, onChanged }: { patientId: string; patient: ConsentPatient | null; onChanged?: () => void }) {
  const { session, syncNow } = useApp();
  const toast = useToast();
  const writable = can(session, 'patients.write');
  const relationships = useMasters('GUARDIAN_RELATIONSHIP');
  const docTypes = useMasters('DOC_TYPE');
  const [rows, setRows] = useState<Consent[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [revoking, setRevoking] = useState<Consent | null>(null);

  const load = useCallback(() => {
    api<{ consents: Consent[] }>(`/api/patients/${patientId}/consents`).then((r) => { setRows(r.consents); setOffline(false); })
      .catch((e) => { if (e instanceof ApiError && e.isNetwork) setOffline(true); setRows([]); });
  }, [patientId]);
  useEffect(load, [load]);
  const refresh = () => { load(); onChanged?.(); void syncNow(); };

  const active = useMemo(() => new Map((rows ?? []).filter((r) => r.status === 'ACTIVE').map((r) => [r.type_code, r])), [rows]);
  const missing = TYPES.filter((t) => !active.has(t));

  if (offline) return <Card><EmptyState icon={<CloudOff className="size-6" />} title="Los consentimientos requieren conexión" /></Card>;
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-4">
      {missing.length > 0 ? (
        <div role="alert" className="flex flex-col gap-3 rounded-card border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
          <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden />
          <p className="flex-1"><strong>Faltan {missing.length === 2 ? 'los consentimientos' : 'un consentimiento'}:</strong> {missing.map((t) => CONSENT_LABELS[t].title).join(' y ')}. Imprime el formato, hazlo firmar y regístralo aquí.</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-card border border-success/30 bg-success/10 p-4 text-sm">
          <ShieldCheck className="size-5 shrink-0 text-success" aria-hidden />
          <p>Consentimientos completos y vigentes.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {TYPES.map((t) => {
          const c = active.get(t);
          return (
            <Card key={t} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{CONSENT_LABELS[t].title}</p>
                  <p className="text-xs text-muted">{CONSENT_LABELS[t].law}</p>
                </div>
                {c ? <Badge color="var(--success)"><CheckCircle2 className="size-3" /> Vigente</Badge> : <Badge color="var(--warning)">Pendiente</Badge>}
              </div>
              {c ? (
                <dl className="mt-3 space-y-1 text-sm">
                  <p><span className="text-muted">Firmó:</span> {c.signer_name}{c.signer_type === 'GUARDIAN' ? ` (apoderado${c.signer_relationship_name ? ` · ${c.signer_relationship_name}` : ''})` : ' (paciente)'}</p>
                  <p><span className="text-muted">Fecha:</span> {consentDate(c.signed_on)} · formato v{c.form_version}</p>
                  {t === 'DATA_PROTECTION' && <p><span className="text-muted">Comunicaciones comerciales:</span> {c.marketing_opt_in ? 'Autorizadas' : 'No autorizadas'}</p>}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {c.file_id && <a href={`/api/files/${c.file_id}`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="secondary" icon={<ExternalLink className="size-4" />}>Ver firmado</Button></a>}
                    {writable && <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRevoking(c)}>Revocar</Button>}
                  </div>
                </dl>
              ) : <p className="mt-3 text-sm text-muted">Aún no se registra el formato firmado.</p>}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/app/patients/${patientId}/consents/print${missing.length && missing.length < 2 ? `?types=${missing.join(',')}` : ''}`}>
          <Button variant="secondary" icon={<Printer className="size-4" />}>Imprimir formato{missing.length === 1 ? ' pendiente' : 's'}</Button>
        </Link>
        {writable && <Button icon={<Upload className="size-4" />} onClick={() => setRegistering(true)}>Registrar formato firmado</Button>}
      </div>

      <Card>
        <div className="border-b border-line px-5 py-3"><h3 className="font-semibold">Historial</h3></div>
        {rows.length === 0 ? <EmptyState icon={<FileSignature className="size-6" />} title="Sin registros" /> : (
          <ul className="divide-y divide-line text-sm">
            {rows.map((r) => (
              <li key={r.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3', r.status !== 'ACTIVE' && 'text-muted')}>
                <span className="font-medium text-fg">{CONSENT_LABELS[r.type_code]?.title ?? r.type_name}</span>
                <span>{consentDate(r.signed_on)} · {r.signer_name}</span>
                {r.status === 'ACTIVE' && <Badge color="var(--success)">Vigente</Badge>}
                {r.status === 'REPLACED' && <Badge>Reemplazado</Badge>}
                {r.status === 'REVOKED' && <Badge color="var(--danger)">Revocado el {consentDate(r.revoked_on)}</Badge>}
                {r.revoke_reason && <span className="w-full text-xs">Motivo: {r.revoke_reason}</span>}
                <span className="ml-auto text-xs">Registró: {r.created_by_name ?? '—'}</span>
                {r.file_id && <a href={`/api/files/${r.file_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">Documento</a>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {registering && <RegisterModal patientId={patientId} patient={patient} missing={missing} relationships={relationships} docTypes={docTypes}
        onClose={() => setRegistering(false)} onSaved={() => { setRegistering(false); toast.success('Consentimiento registrado.'); refresh(); }} />}
      {revoking && <RevokeModal patientId={patientId} c={revoking} tz={session.tenant!.timezone}
        onClose={() => setRevoking(null)} onSaved={() => { setRevoking(null); toast.success('Consentimiento revocado.'); refresh(); }} />}
    </div>
  );
}

type Opt = { id: string; code: string; name: string };
function RegisterModal({ patientId, patient, missing, relationships, docTypes, onClose, onSaved }: {
  patientId: string; patient: ConsentPatient | null; missing: string[]; relationships: Opt[]; docTypes: Opt[]; onClose: () => void; onSaved: () => void;
}) {
  const { session } = useApp();
  const toast = useToast();
  const age = ageFrom(patient?.birthDate);
  const byGuardian = !!patient?.requiresGuardian || (age !== null && age < 18);
  const [types, setTypes] = useState<string[]>(missing.length ? missing : [...TYPES]);
  const [signerType, setSignerType] = useState<'PATIENT' | 'GUARDIAN'>(byGuardian ? 'GUARDIAN' : 'PATIENT');
  const fromPatient = (st: 'PATIENT' | 'GUARDIAN') => st === 'GUARDIAN'
    ? { signerName: patient?.guardianName ?? '', signerDocNumber: patient?.guardianDocNumber ?? '', signerDocTypeId: patient?.guardianDocTypeId ?? '', signerRelationshipId: patient?.guardianRelationshipId ?? '' }
    : { signerName: patient?.name ?? '', signerDocNumber: patient?.docNumber ?? '', signerDocTypeId: patient?.docTypeId ?? '', signerRelationshipId: '' };
  const [f, setF] = useState({ ...fromPatient(signerType), signedOn: todayIn(session.tenant!.timezone), marketingOptIn: false, notes: '' });
  const [file, setFile] = useState<File | null>(null);
  // Si la ficha termina de cargar con el modal abierto, se completan los datos del firmante
  useEffect(() => {
    if (patient) setF((x) => (x.signerName ? x : { ...x, ...fromPatient(signerType) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!file) { setErrors({ file: 'Adjunta el formato firmado (escaneo o foto).' }); return; }
    const fd = new FormData();
    types.forEach((t) => fd.append('types', t));
    fd.append('signerType', signerType);
    Object.entries(f).forEach(([k, v]) => fd.append(k, String(v)));
    fd.append('file', file);
    setSaving(true);
    try { await api(`/api/patients/${patientId}/consents`, { form: fd }); onSaved(); }
    catch (e) { setErrors(fieldErrors(e)); toast.error(e instanceof ApiError ? e.message : 'No se pudo registrar.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} title="Registrar formato firmado" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={saving} disabled={!types.length}>Registrar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">El documento firmado cubre:</p>
          <div className="flex flex-col gap-2">
            {TYPES.map((t) => (
              <Checkbox key={t} label={`${CONSENT_LABELS[t].title} (${CONSENT_LABELS[t].law})`} checked={types.includes(t)}
                onChange={(v) => setTypes((x) => (v ? [...x, t] : x.filter((y) => y !== t)))} />
            ))}
          </div>
          {errors.types && <p className="mt-1 text-xs text-danger">{errors.types}</p>}
        </div>
        <Select label="Firmó" value={signerType} onChange={(e) => { const st = e.target.value as 'PATIENT' | 'GUARDIAN'; setSignerType(st); setF((x) => ({ ...x, ...fromPatient(st) })); }}
          options={[{ value: 'PATIENT', label: 'El paciente' }, { value: 'GUARDIAN', label: 'El apoderado (padre, madre o tutor)' }]}
          hint={byGuardian ? 'Menor de edad o paciente con apoderado: firma el apoderado' : undefined} />
        <Input label="Fecha de firma" type="date" required value={f.signedOn} onChange={(e) => setF({ ...f, signedOn: e.target.value })} error={errors.signedOn} />
        <Input label="Nombre de quien firmó" required value={f.signerName} onChange={(e) => setF({ ...f, signerName: e.target.value })} error={errors.signerName} />
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <Select label="Doc." value={f.signerDocTypeId} onChange={(e) => setF({ ...f, signerDocTypeId: e.target.value })} placeholder="—" options={docTypes.map((d) => ({ value: d.id, label: d.name }))} />
          <Input label="N° de documento" value={f.signerDocNumber} onChange={(e) => setF({ ...f, signerDocNumber: e.target.value })} error={errors.signerDocNumber} />
        </div>
        {signerType === 'GUARDIAN' && (
          <Select label="Parentesco" required value={f.signerRelationshipId} onChange={(e) => setF({ ...f, signerRelationshipId: e.target.value })} placeholder="—"
            options={relationships.map((r) => ({ value: r.id, label: r.name }))} error={errors.signerRelationshipId} />
        )}
        {types.includes('DATA_PROTECTION') && (
          <div className="sm:col-span-2">
            <Checkbox label="Marcó «SÍ autorizo» comunicaciones comerciales (promociones y saludos)" checked={f.marketingOptIn} onChange={(v) => setF({ ...f, marketingOptIn: v })} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="consent-file">Formato firmado <span className="text-danger">*</span></label>
          <input id="consent-file" type="file" accept="image/*,application/pdf" capture="environment"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors((x) => ({ ...x, file: '' })); }}
            className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-surface-2" />
          <p className="mt-1 text-xs text-muted">PDF o foto del documento firmado (en el celular puedes tomar la foto directamente). Hasta 15 MB.</p>
          {errors.file && <p className="mt-1 text-xs text-danger">{errors.file}</p>}
        </div>
        <Textarea label="Observaciones" className="sm:col-span-2" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Modal>
  );
}

function RevokeModal({ patientId, c, tz, onClose, onSaved }: { patientId: string; c: Consent; tz: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [revokedOn, setRevokedOn] = useState(todayIn(tz));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  async function save() {
    try { await api(`/api/patients/${patientId}/consents/${c.id}/revoke`, { body: { revokedOn, reason } }); onSaved(); }
    catch (e) { setErrors(fieldErrors(e)); toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }
  return (
    <Modal open onClose={onClose} title="Revocar consentimiento" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={save}>Revocar</Button></>}>
      <div className="space-y-4 text-sm">
        <p>El titular retira su consentimiento de <strong>{CONSENT_LABELS[c.type_code]?.title}</strong>. Queda registrado en el historial; no afecta lo realizado antes de la revocación.</p>
        <Input label="Fecha de la solicitud" type="date" value={revokedOn} onChange={(e) => setRevokedOn(e.target.value)} error={errors.revokedOn} />
        <Textarea label="Motivo / cómo lo solicitó" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
      </div>
    </Modal>
  );
}
