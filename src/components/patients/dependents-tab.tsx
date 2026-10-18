'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CloudOff, UserPlus, Users } from 'lucide-react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';
import { useApp, can } from '@/lib/client/app-context';
import { ageFrom } from '@/lib/shared/format';

type Dep = { id: string; record_number: string; first_name: string; last_name: string; mother_last_name: string | null; birth_date: string | null; relationship_name: string | null };

/** Familiares que dependen de este paciente (hijos, cónyuge…), con acceso rápido a sus fichas. */
export function DependentsTab({ patientId }: { patientId: string }) {
  const { session } = useApp();
  const [rows, setRows] = useState<Dep[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    api<Dep[]>(`/api/patients/${patientId}/dependents`).then(setRows)
      .catch((e) => { if (e instanceof ApiError && e.isNetwork) setOffline(true); setRows([]); });
  }, [patientId]);

  if (offline) return <Card><EmptyState icon={<CloudOff className="size-6" />} title="Disponible con conexión" /></Card>;
  if (!rows) return <Spinner />;
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-semibold">Dependientes</h2>
        {can(session, 'patients.write') && (
          <Link href={`/app/patients/new?titularId=${patientId}`}><Button size="sm" icon={<UserPlus className="size-4" />}>Agregar dependiente</Button></Link>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title="Sin dependientes" description="Registra a los familiares que se atienden bajo este paciente titular." />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((d) => {
            const age = ageFrom(d.birth_date);
            return (
              <li key={d.id}>
                <Link href={`/app/patients/${d.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
                  <span className="font-mono text-xs text-muted">H.C. {d.record_number}</span>
                  <span className="flex-1 font-medium">{[d.first_name, d.last_name, d.mother_last_name].filter(Boolean).join(' ')}</span>
                  <span className="text-muted">{d.relationship_name ?? ''}{age !== null ? ` · ${age} años` : ''}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
