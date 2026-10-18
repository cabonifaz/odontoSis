import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/shell/auth-card';
import { getSession } from '@/lib/server/session';
import { formatDate } from '@/lib/shared/format';
import { LogoutButton } from './logout-button';

export const metadata = { title: 'Acceso no disponible' };

const MESSAGES: Record<string, (from: string | null, until: string | null) => [string, string]> = {
  SUSPENDED: () => ['Clínica suspendida', 'El acceso de la clínica está suspendido. Comunícate con OdontoSis para regularizarlo.'],
  CANCELLED: () => ['Suscripción cancelada', 'La suscripción de la clínica fue cancelada.'],
  NO_CONTRACT: () => ['Suscripción no iniciada', 'La clínica aún no tiene un contrato que inicie su suscripción oficial. Comunícate con OdontoSis.'],
  CONTRACT_NOT_STARTED: (from) => ['Suscripción por iniciar', `La suscripción oficial inicia el ${formatDate(from)}. Desde esa fecha podrás trabajar.`],
  CONTRACT_EXPIRED: (_f, until) => ['Contrato vencido', `El contrato de la clínica venció el ${formatDate(until)}. Comunícate con OdontoSis para renovarlo.`],
  IMPLEMENTATION_NOT_STARTED: (from) => ['Implementación por iniciar', from ? `El periodo de implementación inicia el ${formatDate(from)}.` : 'El periodo de implementación aún no está programado.'],
  IMPLEMENTATION_ENDED: (_f, until) => ['Periodo de implementación finalizado', `La implementación terminó el ${formatDate(until)}. Para continuar se requiere el contrato de suscripción o una ampliación del periodo.`],
};

export default async function SuspendedPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  const a = s.tenant?.access;
  if (!a || a.phase !== 'BLOCKED') redirect('/');
  const [title, text] = (MESSAGES[a.reason ?? 'SUSPENDED'] ?? MESSAGES.SUSPENDED)(a.from, a.until);
  return (
    <AuthCard title={title} subtitle={text}>
      <LogoutButton tenantCode={s.tenant!.code} />
    </AuthCard>
  );
}
