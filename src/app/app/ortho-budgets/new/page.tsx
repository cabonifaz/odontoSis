'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Spinner } from '@/components/ui';
import { OrthoBudgetEditor, emptyOrthoBudget, type OrthoBudgetDraft } from '@/components/ortho/ortho-budget-editor';
import { useApp } from '@/lib/client/app-context';

export default function NewOrthoBudgetPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, db } = useApp();
  const [draft, setDraft] = useState<OrthoBudgetDraft | null>(null);

  useEffect(() => {
    if (!db) return;
    const patientId = params.get('patientId');
    const d = emptyOrthoBudget(session.tenant!.timezone, patientId, session.doctorId);
    (async () => {
      const p = patientId ? await db.patients.get(patientId) : undefined;
      if (!p?.agreement_id) return setDraft(d);
      // el convenio del paciente sólo se aplica si está activo y vigente hoy
      const ag = await db.agreements.get(p.agreement_id);
      const valid = !!ag && !!ag.is_active && (!ag.valid_from || ag.valid_from.slice(0, 10) <= d.budgetDate) && (!ag.valid_to || ag.valid_to.slice(0, 10) >= d.budgetDate);
      setDraft({ ...d, agreementId: valid ? p.agreement_id : null });
    })();
  }, [db, params, session]);

  return (
    <>
      <PageHeader title="Nuevo presupuesto de ortodoncia" subtitle="Define la aparatología, el costo del tratamiento y la forma de pago en cuotas mensuales." />
      {!draft ? <Spinner /> : (
        <OrthoBudgetEditor initial={draft} onSaved={(id) => router.replace(`/app/ortho-budgets/${id}`)} onCancel={() => router.back()} />
      )}
    </>
  );
}
