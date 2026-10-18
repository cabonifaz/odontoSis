'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { PatientForm } from '@/components/patients/patient-form';

export default function NewPatientPage() {
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  return (
    <>
      <PageHeader title="Nuevo paciente" subtitle="La historia clínica (H.C.) se numera automáticamente." />
      <Card className="p-5 sm:p-6">
        <PatientForm initial={{ id }} onSaved={(pid, queued) => router.replace(queued ? '/app/patients' : `/app/patients/${pid}`)} onCancel={() => router.back()} />
      </Card>
    </>
  );
}
