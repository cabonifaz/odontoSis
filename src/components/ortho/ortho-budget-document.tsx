'use client';
import { Card } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/shared/format';
import type { OrthoBudgetDetail } from './ortho-types';

/** Presupuesto de ortodoncia en formato imprimible (mismo estilo que el presupuesto operatorio). */
export function OrthoBudgetDocument({ b }: { b: OrthoBudgetDetail }) {
  const sym = b.currency_symbol;
  const notes = (b.tenant_budget_notes ?? '').split('\n').filter(Boolean);
  const n = Number(b.installments);
  const differentLast = n > 1 && Number(b.last_installment_amount) !== Number(b.installment_amount);

  return (
    <Card className="print-area relative mx-auto max-w-4xl overflow-hidden p-5 text-[13px] sm:p-8">
      {b.tenant_status_code === 'IMPLEMENTATION' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="-rotate-[30deg] select-none whitespace-nowrap text-center text-4xl font-bold uppercase leading-tight tracking-widest text-danger/15 sm:text-6xl">
            Periodo de implementación<br />Documento sin validez
          </p>
        </div>
      )}
      <header className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {b.tenant_logo_file_id && <img src={`/api/files/${b.tenant_logo_file_id}`} alt="" className="h-14 w-auto max-w-40 object-contain" />}
          <div>
            <p className="text-base font-semibold">{b.tenant_name}</p>
            <p className="text-xs text-muted">{[b.tenant_legal_name, b.tenant_tax_id && `RUC ${b.tenant_tax_id}`].filter(Boolean).join(' · ')}</p>
            <p className="text-xs text-muted">{[b.tenant_address, b.tenant_phone].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="text-sm sm:text-right">
          <p className="font-semibold">PRESUPUESTO DE ORTODONCIA N° {b.budget_number}</p>
          {b.branch_name && <p className="text-muted">Sede: <span className="font-medium text-fg">{b.branch_name}</span>{b.branch_address ? ` · ${b.branch_address}` : ''}</p>}
          <p className="text-muted">Fecha: {formatDate(b.budget_date)} · Válido hasta {formatDate(b.valid_until)}</p>
        </div>
      </header>

      <section className="grid gap-x-8 gap-y-1 border-b border-line py-4 sm:grid-cols-2">
        <Row k="Paciente" v={`${b.patient_last_name}, ${b.patient_first_name}`} />
        <Row k="H.C. N°" v={b.record_number ?? '—'} />
        <Row k="Doctor" v={b.doctor_name ? `${b.doctor_name}${b.doctor_license ? ` (${b.doctor_license})` : ''}` : '—'} />
        <Row k="Documento" v={b.doc_number ? `${b.doc_type_code ?? ''} ${b.doc_number}` : '—'} />
        {!!b.requires_guardian && b.guardian_name && (
          <Row k="Apoderado" v={`${b.guardian_name}${b.guardian_relationship_name ? ` (${b.guardian_relationship_name})` : ''}${b.guardian_doc_number ? ` · ${b.guardian_doc_type_code ?? ''} ${b.guardian_doc_number}` : ''}`} />
        )}
        {b.agreement_name && <Row k="Convenio" v={`${b.agreement_name} (${Number(b.agreement_discount_pct)} % dscto.)${b.agreement_member_code ? ` · Socio N° ${b.agreement_member_code}` : ''}`} />}
        <Row k="Aparatología" v={b.appliance_name} />
        <Row k="Duración estimada" v={`${Number(b.estimated_months)} ${Number(b.estimated_months) === 1 ? 'mes' : 'meses'}`} />
      </section>

      {(b.diagnosis || b.treatment_plan) && (
        <section className="space-y-3 border-b border-line py-4">
          {b.diagnosis && <div><p className="text-xs font-semibold uppercase">Diagnóstico</p><p className="mt-1 whitespace-pre-wrap">{b.diagnosis}</p></div>}
          {b.treatment_plan && <div><p className="text-xs font-semibold uppercase">Plan de tratamiento</p><p className="mt-1 whitespace-pre-wrap">{b.treatment_plan}</p></div>}
        </section>
      )}

      <section className="grid gap-6 py-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase">Resumen económico</h2>
          <table className="w-full">
            <tbody>
              <Line k="Costo del tratamiento" v={formatMoney(b.total_amount, sym)} />
              {Number(b.agreement_discount_amount) > 0 && <Line k={`Descuento convenio (${Number(b.agreement_discount_pct)} %)`} v={`- ${formatMoney(b.agreement_discount_amount, sym)}`} />}
              <Line k="Total tratamiento" v={formatMoney(b.net_amount, sym)} strong />
              <Line k="Cuota inicial" v={formatMoney(b.initial_payment, sym)} />
              <Line k={`${n} cuota${n === 1 ? '' : 's'} mensual${n === 1 ? '' : 'es'} de`} v={formatMoney(b.installment_amount, sym)} />
              {differentLast && <Line k="Última cuota (ajuste)" v={formatMoney(b.last_installment_amount, sym)} />}
              {!!b.includes_retainers && <Line k="Contención (retenedores)" v={formatMoney(b.retainer_amount, sym)} />}
            </tbody>
          </table>
          <p className="mt-3 border-t border-dashed border-fg/50 pt-2 text-right text-base font-semibold">
            TOTAL A CANCELAR: <span className="tabular-nums">{formatMoney(b.grand_total, sym)}</span>
          </p>
          {!b.includes_retainers && <p className="mt-1 text-xs text-muted">No incluye contención (retenedores) al finalizar el tratamiento.</p>}
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase">Cronograma de pagos</h2>
          <table className="w-full">
            <thead>
              <tr className="border-y border-fg/60 text-left text-xs font-semibold uppercase">
                <th className="py-1 pr-2">Cuota</th><th className="pr-2">Vencimiento</th><th className="text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {Number(b.initial_payment) > 0 && (
                <tr><td className="py-0.5 pr-2">Inicial</td><td className="pr-2">{formatDate(b.budget_date)}</td><td className="text-right tabular-nums">{formatMoney(b.initial_payment, sym)}</td></tr>
              )}
              {b.schedule.map((s) => (
                <tr key={s.installment_no}>
                  <td className="py-0.5 pr-2">{s.installment_no}</td><td className="pr-2">{formatDate(s.due_date)}</td>
                  <td className="text-right tabular-nums">{formatMoney(s.amount, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {b.notes && <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Observaciones: </span>{b.notes}</p>}

      <section className="mt-16 grid grid-cols-2 gap-10 text-center text-xs">
        <div className="border-t border-fg/60 pt-1">Firma del Odontólogo Tratante</div>
        <div className="border-t border-fg/60 pt-1">Firma del Paciente - Apoderado</div>
      </section>

      {notes.length > 0 && (
        <footer className="mt-8 text-xs text-muted">
          <p className="font-semibold">Nota:</p>
          <ul className="ml-5 list-disc">{notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </footer>
      )}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <p><span className="inline-block w-36 font-semibold">{k}:</span> {v}</p>;
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <tr className={strong ? 'font-semibold' : undefined}>
      <td className="py-0.5 pr-2">{k}</td><td className="text-right tabular-nums">{v}</td>
    </tr>
  );
}
