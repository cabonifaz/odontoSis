import { AuthCard } from '@/components/shell/auth-card';

export const metadata = { title: 'Sin conexión' };
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <AuthCard title="Sin conexión" subtitle="Esta pantalla aún no está disponible sin internet. Las secciones que ya visitaste (Agenda, Pacientes, Presupuestos) sí funcionan sin conexión y se sincronizarán al reconectar.">
      <a href="/app" className="inline-flex h-10 w-full items-center justify-center rounded-control bg-brand text-sm font-medium text-brand-contrast">Ir al inicio</a>
    </AuthCard>
  );
}
