import { redirect } from 'next/navigation';
import { requirePageSession } from '@/lib/server/guard';
import { AuthCard } from '@/components/shell/auth-card';
import { CodeForm } from './code-form';

export const metadata = { title: 'Verificación' };

export default async function MfaPage() {
  const s = await requirePageSession({ allowPending: true, allowMfaPending: true });
  if (!s.totpEnabled || s.mfaVerified) redirect('/');
  return (
    <AuthCard title="Verificación en dos pasos" subtitle="Ingresa el código de 6 dígitos de tu app de autenticación.">
      <CodeForm />
    </AuthCard>
  );
}
