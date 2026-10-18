import { requirePageSession } from '@/lib/server/guard';
import { toClientSession } from '@/lib/server/client-session';
import { AppShell, BrandStyle } from '@/components/shell/app-shell';
import { AppProvider } from '@/lib/client/app-context';
import { Card, PageHeader } from '@/components/ui';
import { ChangePasswordForm } from '@/components/shell/change-password-form';
import { TotpSetup } from './totp-setup';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Seguridad de la cuenta' };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const s = await requirePageSession({ allowPending: true });
  const cs = toClientSession(s);
  const required = (await searchParams).required === '1';
  return (
    <AppProvider session={cs}>
      <BrandStyle session={cs} />
      <AppShell session={cs}>
        <PageHeader title="Mi cuenta y seguridad" subtitle={`${s.fullName} · ${s.email}`} />
        <Card className="mb-6 p-6">
          <h2 className="mb-4 font-semibold">Mi perfil</h2>
          <ProfileForm initial={{ fullName: s.fullName, nickname: s.nickname, avatar: s.avatar, birthDate: s.birthDate }} />
        </Card>
        {required && !s.totpEnabled && (
          <p role="alert" className="mb-6 rounded-card border border-warning/40 bg-warning/10 p-4 text-sm">
            Las cuentas de administración de plataforma deben activar la verificación en dos pasos para continuar.
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Verificación en dos pasos (2FA)</h2>
            <TotpSetup enabled={s.totpEnabled} />
          </Card>
          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Cambiar contraseña</h2>
            <ChangePasswordForm />
          </Card>
        </div>
      </AppShell>
    </AppProvider>
  );
}
