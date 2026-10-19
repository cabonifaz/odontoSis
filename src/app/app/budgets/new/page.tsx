'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Spinner } from '@/components/ui';
import { BudgetEditor, emptyBudget, type BudgetDraft } from '@/components/budgets/budget-editor';
import { useApp } from '@/lib/client/app-context';
import { HelpButton, Tour, useTour } from '@/components/help/tour';
import { BUDGET_EDITOR_TOUR } from '@/components/help/budget-tours';

export default function NewBudgetPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, db } = useApp();
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  const tour = useTour('budget-editor', session.userId, !!draft);
  // ?tour=1 (desde Ayuda): abre la guía apenas carga el editor
  const { start } = tour;
  const launched = useRef(false);
  useEffect(() => {
    if (!draft || launched.current || params.get('tour') !== '1') return;
    launched.current = true;
    window.setTimeout(start, 500);
  }, [draft, params, start]);

  useEffect(() => {
    if (!db) return;
    const patientId = params.get('patientId');
    const d = emptyBudget(session.tenant!.timezone, patientId, session.doctorId);
    // precarga el seguro del paciente si viene desde su ficha
    (async () => {
      const p = patientId ? await db.patients.get(patientId) : undefined;
      if (!p) return setDraft(d);
      // el convenio del paciente sólo se aplica si está activo y vigente hoy
      const ag = p.agreement_id ? await db.agreements.get(p.agreement_id) : undefined;
      const valid = !!ag && !!ag.is_active && (!ag.valid_from || ag.valid_from.slice(0, 10) <= d.budgetDate) && (!ag.valid_to || ag.valid_to.slice(0, 10) >= d.budgetDate);
      setDraft({
        ...d, insuranceCompany: p.insurance_company, deductible: Number(p.deductible ?? 0), coinsurancePct: Number(p.coinsurance_pct ?? 0),
        agreementId: valid ? p.agreement_id ?? null : null, priceListId: p.price_list_id ?? null, branchId: p.home_branch_id ?? null,
      });
    })();
  }, [db, params, session]);

  return (
    <>
      <PageHeader title="Nuevo presupuesto" subtitle="Sigue los pasos ① a ④: paciente, odontograma y tratamientos, revisión y guardar."
        actions={<HelpButton onClick={tour.start} />} />
      <Tour steps={BUDGET_EDITOR_TOUR} open={tour.open} onClose={tour.close} />
      {!draft ? <Spinner /> : (
        <BudgetEditor initial={draft}
          onSaved={(id, queued) => router.replace(queued ? '/app/budgets' : `/app/budgets/${id}`)}
          onCancel={() => router.back()} />
      )}
    </>
  );
}
