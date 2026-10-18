import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';
import { homeFor } from '@/lib/server/guard';
import { spOne } from '@/lib/server/db';
import { AuthCard } from '@/components/shell/auth-card';
import { LoginForm } from '@/app/login/login-form';

type PublicTenant = { code: string; trade_name: string; primary_color: string; secondary_color: string; logo_file_id: string | null; status_code: string };

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = /^[a-z0-9_-]{1,40}$/i.test(code) ? await spOne<PublicTenant>('sp_tenant_public_get', [code]) : null;
  return { title: t ? `Ingreso · ${t.trade_name}` : 'Iniciar sesión' };
}

/** Login propio de cada clínica: /c/<código>. Sólo admite usuarios de esa clínica. */
export default async function TenantLoginPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^[a-z0-9_-]{1,40}$/i.test(code)) notFound();
  const t = await spOne<PublicTenant>('sp_tenant_public_get', [code]);
  if (!t) notFound();

  const s = await getSession();
  if (s) redirect(homeFor(s));

  const brand = {
    name: t.trade_name,
    logoUrl: t.logo_file_id ? `/api/public/tenants/${t.code}/logo` : null,
    primary: t.primary_color,
    secondary: t.secondary_color,
  };
  if (t.status_code === 'CANCELLED') {
    return <AuthCard brand={brand} title="Acceso no disponible" subtitle="Esta clínica no tiene una suscripción activa." ><span /></AuthCard>;
  }
  return (
    <AuthCard brand={brand} title="Iniciar sesión" subtitle={`Ingreso para el personal de ${t.trade_name}`}>
      <LoginForm tenantCode={t.code} />
    </AuthCard>
  );
}
