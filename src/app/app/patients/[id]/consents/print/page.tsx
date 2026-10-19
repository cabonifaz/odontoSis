'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, CloudOff, Printer } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';
import { ageFrom } from '@/lib/shared/format';
import { DataProtectionConsent, MedicalConfidentialityConsent, type ConsentClinic, type ConsentPerson } from '@/components/patients/consent-documents';

type Patient = {
  firstName: string; lastName: string; motherLastName: string | null; docNumber: string | null; recordNumber: string; birthDate: string | null;
  requiresGuardian: boolean; guardianName: string | null; guardianDocNumber: string | null; guardianRelationshipName: string | null;
};
type ConsentData = { formVersion: string; clinic: (ConsentClinic & { logo_file_id: string | null; status_code: string | null }) | null };

/** Formatos de consentimiento listos para imprimir y firmar (un consentimiento por hoja) */
export default function ConsentPrintPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const types = (params.get('types') ?? 'DATA_PROTECTION,MEDICAL_CONFIDENTIALITY').split(',');
  const [p, setP] = useState<Patient | null>(null);
  const [d, setD] = useState<ConsentData | null>(null);
  const [state, setState] = useState<'loading' | 'offline' | 'missing' | 'ok'>('loading');

  useEffect(() => {
    Promise.all([api<Patient>(`/api/patients/${id}`), api<ConsentData>(`/api/patients/${id}/consents`)])
      .then(([pp, dd]) => { setP(pp); setD(dd); setState('ok'); })
      .catch((e) => setState(e instanceof ApiError && e.isNetwork ? 'offline' : 'missing'));
  }, [id]);

  const patientName = p ? [p.firstName, p.lastName, p.motherLastName].filter(Boolean).join(' ') : '';
  useEffect(() => {
    if (!p) return;
    const prev = document.title;
    document.title = `Consentimientos - ${p.lastName}, ${p.firstName}`;
    return () => { document.title = prev; };
  }, [p]);

  if (state === 'offline') return <Card><EmptyState icon={<CloudOff className="size-6" />} title="Los formatos requieren conexión" /></Card>;
  if (state === 'missing') return <Card><EmptyState title="Paciente no encontrado" /></Card>;
  if (!p || !d?.clinic) return <Spinner />;

  // Firma el apoderado si el paciente es menor de edad o requiere apoderado
  const age = ageFrom(p.birthDate);
  const byGuardian = p.requiresGuardian || (age !== null && age < 18);
  const person: ConsentPerson = {
    patientName, patientDoc: p.docNumber, recordNumber: p.recordNumber,
    guardian: byGuardian ? { name: p.guardianName, doc: p.guardianDocNumber, relationship: p.guardianRelationshipName } : null,
  };
  const city = d.clinic.address?.split(',').pop()?.trim() ?? null;
  const pages = types.filter((t) => t === 'DATA_PROTECTION' || t === 'MEDICAL_CONFIDENTIALITY');

  return (
    <>
      <div className="no-print">
        <PageHeader title="Formatos de consentimiento" subtitle={`${patientName} · H.C. ${p.recordNumber}${byGuardian ? ' · firma el apoderado' : ''}`}
          actions={<>
            <Link href={`/app/patients/${id}?tab=consentimientos`}><Button variant="secondary" icon={<ArrowLeft className="size-4" />}>Volver</Button></Link>
            <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / PDF</Button>
          </>} />
        <p className="mb-4 rounded-card border border-warning/40 bg-warning/10 p-3 text-sm">
          Formatos referenciales basados en la normativa peruana. Antes de usarlos, la clínica debe validarlos con su asesor legal.
          Imprime, haz firmar (y poner la huella) y luego registra el documento firmado en la ficha del paciente.
        </p>
      </div>
      {pages.map((t, i) => (
        <Card key={t} className={`print-area relative mx-auto mb-6 max-w-4xl overflow-hidden p-6 print:mb-0 sm:p-10 ${i > 0 ? 'print:break-before-page' : ''}`}>
          {d.clinic!.status_code === 'IMPLEMENTATION' && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <p className="-rotate-[30deg] select-none whitespace-nowrap text-center text-4xl font-bold uppercase leading-tight tracking-widest text-danger/15 sm:text-6xl">Periodo de implementación<br />Documento sin validez</p>
            </div>
          )}
          <header className="mb-4 flex items-center gap-3 border-b border-line pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {d.clinic!.logo_file_id && <img src={`/api/files/${d.clinic!.logo_file_id}`} alt="" className="h-12 w-auto max-w-36 object-contain" />}
            <div className="text-xs">
              <p className="text-sm font-semibold">{d.clinic!.trade_name}</p>
              <p className="text-muted">{[d.clinic!.legal_name, d.clinic!.tax_id && `RUC ${d.clinic!.tax_id}`].filter(Boolean).join(' · ')}</p>
              <p className="text-muted">{[d.clinic!.address, d.clinic!.phone, d.clinic!.email].filter(Boolean).join(' · ')}</p>
            </div>
          </header>
          {t === 'DATA_PROTECTION'
            ? <DataProtectionConsent c={d.clinic!} p={person} version={d.formVersion} city={city} />
            : <MedicalConfidentialityConsent c={d.clinic!} p={person} version={d.formVersion} city={city} />}
        </Card>
      ))}
    </>
  );
}
