import { requirePageSession } from '@/lib/server/guard';
import { toClientSession } from '@/lib/server/client-session';
import { AppShell, BrandStyle } from '@/components/shell/app-shell';
import { AppProvider } from '@/lib/client/app-context';

export default async function ClinicLayout({ children }: { children: React.ReactNode }) {
  const s = toClientSession(await requirePageSession({ platform: false }));
  return (
    <AppProvider session={s}>
      <BrandStyle session={s} />
      <AppShell session={s}>{children}</AppShell>
    </AppProvider>
  );
}
