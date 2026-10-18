import { requirePageSession } from '@/lib/server/guard';
import { toClientSession } from '@/lib/server/client-session';
import { AppShell } from '@/components/shell/app-shell';
import { AppProvider } from '@/lib/client/app-context';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = toClientSession(await requirePageSession({ platform: true }));
  return (
    <AppProvider session={s}>
      <AppShell session={s}>{children}</AppShell>
    </AppProvider>
  );
}
