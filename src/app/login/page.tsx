import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';
import { homeFor } from '@/lib/server/guard';
import { AuthCard } from '@/components/shell/auth-card';
import { LoginForm } from './login-form';

export const metadata = { title: 'Iniciar sesión' };

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect(homeFor(s));
  return (
    <AuthCard title="Iniciar sesión" subtitle="Accede a la gestión de tu clínica">
      <LoginForm />
    </AuthCard>
  );
}
