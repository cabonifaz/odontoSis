'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, PageHeader, Spinner } from '@/components/ui';
import { PatientForm, type PatientFormValue } from '@/components/patients/patient-form';
import { useApp } from '@/lib/client/app-context';

export default function NewPatientPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { db } = useApp();
  const [initial, setInitial] = useState<PatientFormValue | null>(null);

  // ?titularId= : alta de un dependiente; hereda sede, tarifario y datos del titular como apoderado
  useEffect(() => {
    const id = crypto.randomUUID();
    const titularId = params.get('titularId');
    if (!titularId || !db) { setInitial({ id }); return; }
    db.patients.get(titularId).then((t) => setInitial(t ? {
      id, titularPatientId: t.id, homeBranchId: t.home_branch_id ?? null, priceListId: t.price_list_id ?? null,
      assignedDoctorId: t.assigned_doctor_id ?? null, lastName: t.last_name,
      guardianName: [t.first_name, t.last_name, t.mother_last_name].filter(Boolean).join(' '), guardianPhone: t.phone,
    } : { id }));
  }, [params, db]);

  return (
    <>
      <PageHeader title={params.get('titularId') ? 'Nuevo dependiente' : 'Nuevo paciente'} subtitle="La historia clínica (H.C.) se numera automáticamente." />
      <Card className="p-5 sm:p-6">
        {!initial ? <Spinner /> : (
          <PatientForm initial={initial} onSaved={(pid, queued) => router.replace(queued ? '/app/patients' : `/app/patients/${pid}`)} onCancel={() => router.back()} />
        )}
      </Card>
    </>
  );
}
