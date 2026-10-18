'use client';
import { useEffect, useState } from 'react';
import { CloudOff, NotebookText } from 'lucide-react';
import { Badge, Card, EmptyState, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';
import { formatDate } from '@/lib/shared/format';

type Note = { id: string; note_date: string; note: string | null; doctor_name: string | null; external_code: string | null; imported: number | boolean };

/**
 * Historia clínica del paciente (sólo lectura): antecedentes y alergias de la ficha + notas de evolución por fecha
 * (cargadas con la carga masiva desde el sistema anterior). No se guarda offline.
 */
export function ClinicalNotesTab({ patientId, medicalHistory, allergies }: { patientId: string; medicalHistory?: string | null; allergies?: string | null }) {
  const [rows, setRows] = useState<Note[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api<{ rows: Note[] }>(`/api/patients/${patientId}/clinical-notes`)
      .then((r) => setRows(r.rows))
      .catch((e) => { if (e instanceof ApiError && e.isNetwork) setOffline(true); setRows([]); });
  }, [patientId]);

  if (offline) return <Card><EmptyState icon={<CloudOff className="size-6" />} title="La historia clínica no está disponible sin conexión" /></Card>;
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-4">
      {(medicalHistory || allergies) && (
        <Card className="p-4 sm:p-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Antecedentes</dt><dd className="mt-0.5 whitespace-pre-wrap">{medicalHistory || '—'}</dd></div>
            <div><dt className="text-muted">Alergias</dt><dd className="mt-0.5 whitespace-pre-wrap">{allergies || '—'}</dd></div>
          </dl>
        </Card>
      )}
      {rows.length === 0 ? (
        <Card><EmptyState icon={<NotebookText className="size-6" />} title="Sin notas de evolución"
          description="Las evoluciones de la historia clínica del sistema anterior se cargan desde Carga masiva." /></Card>
      ) : (
        <Card>
          <ol className="divide-y divide-line" aria-label="Notas de evolución">
            {rows.map((n) => (
              <li key={n.id} className="px-4 py-4 sm:px-5">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{formatDate(String(n.note_date).slice(0, 10))}</span>
                  {n.doctor_name && <span className="text-muted">· {n.doctor_name}</span>}
                  {Number(n.imported) === 1 && <Badge color="var(--info)">Importada</Badge>}
                  {n.external_code && <span className="font-mono text-xs text-subtle">{n.external_code}</span>}
                </div>
                <p className="whitespace-pre-wrap text-sm">{n.note}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
