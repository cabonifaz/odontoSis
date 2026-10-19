'use client';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldAlert } from 'lucide-react';
import { useApp, can } from '@/lib/client/app-context';
import { parseDbDate, todayIn, zonedParts } from '@/lib/shared/format';

/**
 * Alerta del Inicio: pacientes sin consentimientos firmados (datos personales y confidencialidad),
 * destacando a los citados hoy —el mejor momento para hacerlos firmar—. Usa los datos locales.
 */
export function ConsentsAlert() {
  const { db, session } = useApp();
  const tz = session.tenant!.timezone;
  const data = useLiveQuery(async () => {
    if (!db) return null;
    const today = todayIn(tz);
    const lacking = new Set((await db.patients.filter((p) => !!p.is_active && p.consent_status !== 'OK' && !p.pending).toArray()).map((p) => p.id));
    const todayIds = new Set((await db.appointments.filter((a) => {
      if (a.status_code === 'CANCELLED') return false;
      const d = parseDbDate(a.start_at);
      return !!d && zonedParts(d, tz).date === today;
    }).toArray()).map((a) => a.patient_id));
    return { total: lacking.size, today: [...todayIds].filter((id) => lacking.has(id)).length };
  }, [db, tz]);
  if (!data || data.total === 0 || !can(session, 'patients.read')) return null;
  return (
    <div role="alert" className="mb-4 flex flex-col gap-3 rounded-card border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
      <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden />
      <p className="flex-1">
        {data.today > 0 && <><strong>{data.today === 1 ? '1 paciente citado hoy no tiene' : `${data.today} pacientes citados hoy no tienen`} sus consentimientos firmados.</strong> Aprovecha su visita para hacerlos firmar. </>}
        <span className={data.today > 0 ? 'text-muted' : ''}>{data.total === 1 ? '1 paciente' : `${data.total} pacientes`} en total sin consentimientos completos (datos personales y confidencialidad clínica).</span>
      </p>
      <Link href="/app/patients?consent=missing" className="shrink-0 font-medium text-brand hover:underline">Ver pacientes →</Link>
    </div>
  );
}
