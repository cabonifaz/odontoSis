'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, CloudOff, Printer } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';
import { ageFrom, formatDate } from '@/lib/shared/format';

type ReferralSheet = {
  id: string; referral_date: string; specialty_name: string | null; referred_to_name: string | null; referred_to_contact: string | null;
  is_internal: number; to_doctor_name: string | null; to_doctor_license: string | null; reason: string; clinical_notes: string | null;
  status_name: string; patient_first_name: string; patient_last_name: string; record_number: string; patient_birth_date: string | null;
  doc_type_code: string | null; doc_number: string | null; patient_insurance_company: string | null;
  doctor_name: string | null; doctor_license: string | null; doctor_specialty_name: string | null;
  tenant_name: string; tenant_legal_name: string | null; tenant_tax_id: string | null; tenant_address: string | null;
  tenant_phone: string | null; tenant_logo_file_id: string | null; tenant_status_code: string | null;
};

/** Hoja de derivación imprimible (mismo estilo que el presupuesto; sin nombre ni URL de la aplicación). */
export default function ReferralPrintPage() {
  const { id, referralId } = useParams<{ id: string; referralId: string }>();
  const [r, setR] = useState<ReferralSheet | null>(null);
  const [state, setState] = useState<'loading' | 'offline' | 'missing' | 'ok'>('loading');

  useEffect(() => {
    api<ReferralSheet>(`/api/patients/${id}/referrals/${referralId}`)
      .then((x) => { setR(x); setState('ok'); })
      .catch((e) => setState(e instanceof ApiError && e.isNetwork ? 'offline' : 'missing'));
  }, [id, referralId]);

  // Título de la pestaña = nombre por defecto del PDF al imprimir
  useEffect(() => {
    if (!r) return;
    const prev = document.title;
    document.title = `Derivación ${formatDate(r.referral_date.slice(0, 10)).replaceAll('/', '-')} - ${r.patient_last_name}, ${r.patient_first_name}`;
    return () => { document.title = prev; };
  }, [r]);

  if (state === 'offline') return <Card><EmptyState icon={<CloudOff className="size-6" />} title="Hoja de derivación no disponible sin conexión" /></Card>;
  if (state === 'missing') return <Card><EmptyState title="Derivación no encontrada" action={<Link href={`/app/patients/${id}`}><Button variant="secondary">Volver al paciente</Button></Link>} /></Card>;
  if (!r) return <Spinner />;

  const age = ageFrom(r.patient_birth_date);
  const target = r.is_internal ? (r.to_doctor_name ?? r.referred_to_name) : r.referred_to_name;
  return (
    <>
      <div className="no-print">
        <PageHeader title="Hoja de derivación" subtitle={`${r.patient_last_name}, ${r.patient_first_name} · H.C. ${r.record_number}`}
          actions={<>
            <Link href={`/app/patients/${id}`}><Button variant="secondary" icon={<ArrowLeft className="size-4" />}>Volver</Button></Link>
            <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir / PDF</Button>
          </>} />
      </div>

      <Card className="print-area relative mx-auto max-w-4xl overflow-hidden p-5 text-[13px] sm:p-8">
        {r.tenant_status_code === 'IMPLEMENTATION' && (
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="-rotate-[30deg] select-none whitespace-nowrap text-center text-4xl font-bold uppercase leading-tight tracking-widest text-danger/15 sm:text-6xl">
              Periodo de implementación<br />Documento sin validez
            </p>
          </div>
        )}
        <header className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {r.tenant_logo_file_id && <img src={`/api/files/${r.tenant_logo_file_id}`} alt="" className="h-14 w-auto max-w-40 object-contain" />}
            <div>
              <p className="text-base font-semibold">{r.tenant_name}</p>
              <p className="text-xs text-muted">{[r.tenant_legal_name, r.tenant_tax_id && `RUC ${r.tenant_tax_id}`].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-muted">{[r.tenant_address, r.tenant_phone].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-semibold">HOJA DE DERIVACIÓN</p>
            <p className="text-muted">Fecha: {formatDate(r.referral_date.slice(0, 10))}</p>
          </div>
        </header>

        <section className="grid gap-x-8 gap-y-1 border-b border-line py-4 sm:grid-cols-2">
          <Row k="Paciente" v={`${r.patient_last_name}, ${r.patient_first_name}`} />
          <Row k="H.C. N°" v={r.record_number} />
          <Row k="Documento" v={r.doc_number ? `${r.doc_type_code ?? ''} ${r.doc_number}` : '—'} />
          <Row k="Edad" v={age !== null ? `${age} años` : '—'} />
          <Row k="Comp. de seguros" v={r.patient_insurance_company ?? 'Particular'} />
        </section>

        <section className="grid gap-x-8 gap-y-1 border-b border-line py-4 sm:grid-cols-2">
          <Row k="Se deriva a" v={target ?? '—'} />
          <Row k="Especialidad" v={r.specialty_name ?? '—'} />
          {r.referred_to_contact && <Row k="Contacto" v={r.referred_to_contact} />}
          {!!r.is_internal && r.to_doctor_license && <Row k="COP" v={r.to_doctor_license} />}
          <Row k="Derivado por" v={r.doctor_name ? `${r.doctor_name}${r.doctor_license ? ` (COP ${r.doctor_license})` : ''}` : '—'} />
        </section>

        <section className="space-y-4 py-4">
          <Block title="Motivo de la derivación" text={r.reason} />
          {r.clinical_notes && <Block title="Hallazgos / notas clínicas" text={r.clinical_notes} />}
          <p className="text-xs text-muted">Agradeceremos remitir la contrarreferencia con los hallazgos y el tratamiento realizado.</p>
        </section>

        <section className="mt-20 flex justify-end text-center text-xs">
          <div className="w-64 border-t border-fg/60 pt-1">
            <p>Firma y sello del odontólogo</p>
            {r.doctor_name && <p className="mt-0.5 font-medium">{r.doctor_name}{r.doctor_license ? ` · COP ${r.doctor_license}` : ''}</p>}
            {r.doctor_specialty_name && <p className="text-muted">{r.doctor_specialty_name}</p>}
          </div>
        </section>
      </Card>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <p><span className="inline-block w-36 font-semibold">{k}:</span> {v}</p>;
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide">{title}</h2>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}
