import { requirePageSession } from '@/lib/server/guard';
import { AuthCard } from '@/components/shell/auth-card';
import { ChangePasswordForm } from '@/components/shell/change-password-form';

export const metadata = { title: 'Cambiar contraseña' };

export default async function ChangePasswordPage() {
  const s = await requirePageSession({ allowPending: true });
  return (
    <AuthCard title="Crea tu contraseña" subtitle={s.mustChangePassword ? 'Por seguridad, cambia la contraseña temporal antes de continuar.' : 'Actualiza tu contraseña.'}>
      <ChangePasswordForm redirectTo="/" />
    </AuthCard>
  );
}
