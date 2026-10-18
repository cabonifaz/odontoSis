'use client';
import { Card } from '@/components/ui';
import { useMasters } from '@/lib/client/app-context';
import { Odontogram, OdontogramLegend, toConditions } from '@/components/odontogram/odontogram';
import { formatDate, formatMoney } from '@/lib/shared/format';
import type { BudgetDetail } from './budget-types';

/** Presupuesto en formato imprimible (réplica del formato físico de la clínica). */
export function BudgetDocument({ b }: { b: BudgetDetail; timezone: string }) {
  const conditions = toConditions(useMasters('TOOTH_CONDITION'));
  const sym = b.currency_symbol;
  const insured = !!b.insurance_company;
  const totalTreatments = b.items.reduce((s, i) => s + Number(i.total), 0);
  const totalDeductible = b.items.reduce((s, i) => s + Number(i.deductible), 0);
  const totalCoins = b.items.reduce((s, i) => s + Number(i.coinsurance), 0);
  const toPay = insured ? totalDeductible + totalCoins : Math.max(totalTreatments - Number(b.discount), 0);
  const planned = new Set(b.items.map((i) => i.tooth_code).filter(Boolean) as string[]);
  const notes = (b.tenant_budget_notes ?? '').split('\n').filter(Boolean);

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
          <p className="font-semibold">PRESUPUESTO N° {b.budget_number}</p>
          {b.branch_name && <p className="text-muted">Sede: <span className="font-medium text-fg">{b.branch_name}</span>{b.branch_address ? ` · ${b.branch_address}` : ''}</p>}
          <p className="text-muted">Fecha: {formatDate(b.budget_date)} · Válido hasta {formatDate(b.valid_until)}</p>
        </div>
      </header>

      <section className="grid gap-x-8 gap-y-1 border-b border-line py-4 sm:grid-cols-2">
        <Row k="Paciente" v={`${b.patient_last_name}, ${b.patient_first_name}`} />
        <Row k="H.C. N°" v={b.record_number} />
        <Row k="Doctor" v={b.doctor_name ? `${b.doctor_name}${b.doctor_license ? ` (${b.doctor_license})` : ''}` : '—'} />
        <Row k="Documento" v={b.doc_number ? `${b.doc_type_code ?? ''} ${b.doc_number}` : '—'} />
        {!!b.requires_guardian && b.guardian_name && (
          <Row k="Apoderado" v={`${b.guardian_name}${b.guardian_relationship_name ? ` (${b.guardian_relationship_name})` : ''}${b.guardian_doc_number ? ` · ${b.guardian_doc_type_code ?? ''} ${b.guardian_doc_number}` : ''}`} />
        )}
        <Row k="Comp. de seguros" v={b.insurance_company ?? 'Particular'} />
        {b.agreement_name && <Row k="Convenio" v={`${b.agreement_name} (${Number(b.agreement_discount_pct)} % dscto.)${b.agreement_member_code ? ` · Socio N° ${b.agreement_member_code}` : ''}`} />}
        {insured && <Row k="Deduc. x pza / Coaseguro" v={`${formatMoney(b.deductible, sym)} / ${Number(b.coinsurance_pct)}%`} />}
      </section>

      <section className="py-4">
        <h2 className="mb-2 text-center text-base font-semibold tracking-[0.3em] underline underline-offset-4">ODONTOGRAMA</h2>
        <div className="overflow-x-auto">
          <Odontogram marks={b.marks.map((m) => ({ toothCode: m.tooth_code, surface: m.surface, conditionId: m.condition_id }))} conditions={conditions} planned={planned} readOnly />
        </div>
        <div className="mt-2"><OdontogramLegend conditions={conditions.filter((c) => b.marks.some((m) => m.condition_id === c.id))} /></div>
      </section>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-y border-fg/60 text-left text-xs font-semibold uppercase">
              <th className="py-1.5 pr-2">Pieza</th><th className="pr-2">Superficie</th><th className="pr-2">Tratamientos</th>
              {insured && <><th className="pr-2 text-right">Deducible</th><th className="pr-2 text-right">Coaseguro</th></>}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colSpan={insured ? 6 : 4} className="pt-2 text-xs font-semibold uppercase">{insured ? 'Tratamientos con seguro' : 'Tratamientos particulares'}</td></tr>
            {b.items.map((i) => (
              <tr key={i.id} className="align-baseline">
                <td className="py-1 pr-2 font-mono">{i.tooth_code ?? ''}</td>
                <td className="pr-2 font-mono text-xs">{i.surfaces ?? ''}</td>
                <td className="pr-2 uppercase">{i.description}{Number(i.quantity) !== 1 ? ` (x${Number(i.quantity)})` : ''}</td>
                {insured && <><td className="pr-2 text-right tabular-nums">{formatMoney(i.deductible, sym)}</td><td className="pr-2 text-right tabular-nums">{formatMoney(i.coinsurance, sym)}</td></>}
                <td className="text-right tabular-nums">{formatMoney(i.total, sym)}</td>
              </tr>
            ))}
            <tr className="border-t border-dashed border-fg/50 font-semibold">
              <td colSpan={insured ? 3 : 3} className="py-1.5 text-right uppercase">Total tratamientos</td>
              {insured && <><td className="text-right tabular-nums">{formatMoney(totalDeductible, sym)}</td><td className="text-right tabular-nums">{formatMoney(totalCoins, sym)}</td></>}
              <td className="text-right tabular-nums">{formatMoney(totalTreatments, sym)}</td>
            </tr>
            {Number(b.agreement_discount_pct) > 0 && (
              <tr><td colSpan={insured ? 5 : 3} className="py-1 text-right text-xs">
                Precios con {Number(b.agreement_discount_pct)} % de descuento por convenio. Ahorro: {formatMoney(b.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0) - totalTreatments, sym)}
              </td><td /></tr>
            )}
            {!insured && Number(b.discount) > 0 && (
              <tr><td colSpan={3} className="py-1 text-right">Descuento</td><td className="text-right tabular-nums">- {formatMoney(b.discount, sym)}</td></tr>
            )}
          </tbody>
        </table>
        <p className="mt-4 text-right text-base font-semibold">TOTAL A CANCELAR: <span className="tabular-nums">{formatMoney(toPay, sym)}</span></p>
        {b.notes && <p className="mt-3 whitespace-pre-wrap text-sm"><span className="font-semibold">Observaciones: </span>{b.notes}</p>}
      </section>

      <section className="mt-16 grid grid-cols-2 gap-10 text-center text-xs">
        <div className="border-t border-fg/60 pt-1">Firma del Odontólogo Tratante</div>
        <div className="border-t border-fg/60 pt-1">Firma del Paciente - Apoderado</div>
      </section>

      {notes.length > 0 && (
        <footer className="mt-8 text-xs text-muted">
          <p className="font-semibold">Nota:</p>
          <ul className="ml-5 list-disc">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </footer>
      )}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <p><span className="inline-block w-36 font-semibold">{k}:</span> {v}</p>;
}
