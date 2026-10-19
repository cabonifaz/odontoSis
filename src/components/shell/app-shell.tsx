'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  CalendarDays, ClipboardList, Cloud, CloudOff, LayoutDashboard, LogOut, Menu, RefreshCw, Settings, ShieldCheck,
  Stethoscope, Tags, UserCog, Handshake, LifeBuoy, FlaskConical, Users, X, Building2, CreditCard, Layers, AlertTriangle, IdCard, CircleHelp,
  FileUp,
} from 'lucide-react';
import { cx } from '@/components/ui';
import { UserAvatar, displayName } from '@/components/avatar';
import { ProfileQuickModal } from '@/components/profile-quick';
import { NotificationBell, badgeText } from '@/components/shell/notification-bell';
import { useNotifications, useTodayCounts } from '@/lib/client/notifications';
import { useApp, can } from '@/lib/client/app-context';
import { api } from '@/lib/client/api';
import { wipeLocalData } from '@/lib/client/offline-db';
import { formatDate, formatDateTime } from '@/lib/shared/format';
import type { ClientSession } from '@/lib/shared/types';

type NavItem = { href: string; label: string; icon: ReactNode; perm?: string; /** sólo visible en esa fase de la clínica */ phase?: 'IMPLEMENTATION';
  /** contador junto al ítem: citas de hoy, presupuestos que vencen hoy, respuestas sin leer */
  badge?: 'agenda' | 'budgets' | 'requests' };

const CLINIC_NAV: NavItem[] = [
  { href: '/app', label: 'Inicio', icon: <LayoutDashboard className="size-5" /> },
  { href: '/app/agenda', label: 'Agenda', icon: <CalendarDays className="size-5" />, perm: 'appointments.read', badge: 'agenda' },
  { href: '/app/patients', label: 'Pacientes', icon: <Users className="size-5" />, perm: 'patients.read' },
  { href: '/app/budgets', label: 'Presupuestos', icon: <ClipboardList className="size-5" />, perm: 'budgets.read', badge: 'budgets' },
  { href: '/app/services', label: 'Lista de precios', icon: <Tags className="size-5" />, perm: 'services.read' },
  { href: '/app/agreements', label: 'Convenios', icon: <Handshake className="size-5" />, perm: 'settings.manage' },
  { href: '/app/doctors', label: 'Doctores', icon: <Stethoscope className="size-5" />, perm: 'doctors.read' },
  { href: '/app/users', label: 'Usuarios', icon: <UserCog className="size-5" />, perm: 'users.manage' },
  { href: '/app/settings', label: 'Configuración', icon: <Settings className="size-5" />, perm: 'settings.manage' },
  { href: '/app/import', label: 'Carga masiva', icon: <FileUp className="size-5" />, perm: 'settings.manage', phase: 'IMPLEMENTATION' },
  { href: '/app/requests', label: 'Soporte y mejoras', icon: <LifeBuoy className="size-5" />, badge: 'requests' },
  { href: '/app/help', label: 'Ayuda', icon: <CircleHelp className="size-5" /> },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Resumen', icon: <LayoutDashboard className="size-5" /> },
  { href: '/admin/tenants', label: 'Clínicas', icon: <Building2 className="size-5" /> },
  { href: '/admin/plans', label: 'Planes', icon: <Layers className="size-5" /> },
  { href: '/admin/payments', label: 'Pagos', icon: <CreditCard className="size-5" /> },
  { href: '/admin/requests', label: 'Solicitudes', icon: <LifeBuoy className="size-5" />, badge: 'requests' },
  { href: '/admin/catalogs', label: 'Catálogos', icon: <Tags className="size-5" /> },
  { href: '/admin/dni', label: 'Consultas DNI', icon: <IdCard className="size-5" /> },
];

export async function logout(tenantCode?: string | null) {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* sin conexión: igual se limpia lo local */ }
  await wipeLocalData().catch(() => {});
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
  // Cada usuario de clínica vuelve al login de su clínica
  window.location.href = tenantCode ? `/c/${tenantCode}` : '/login';
}

export function AppShell({ session, children }: { session: ClientSession; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { byArea } = useNotifications();
  const today = useTodayCounts();
  /** Contador de cada ítem del menú: valor, color y texto para lectores de pantalla */
  const badgeOf = (k?: NavItem['badge']) => {
    if (k === 'agenda') return { n: today.appointmentsToday, tone: 'bg-brand text-[color:var(--brand-contrast,#fff)]', label: `${today.appointmentsToday} citas por atender hoy` };
    if (k === 'budgets') return { n: today.budgetsDueToday, tone: 'bg-warning text-white', label: `${today.budgetsDueToday} presupuestos vencen hoy` };
    if (k === 'requests') return { n: byArea.requests ?? 0, tone: 'bg-danger text-white', label: `${byArea.requests ?? 0} sin leer` };
    return null;
  };
  const nav = (session.isPlatform ? ADMIN_NAV : CLINIC_NAV).filter((n) => (!n.perm || can(session, n.perm)) && (!n.phase || session.tenant?.access.phase === n.phase));
  const isActive = (href: string) => (href === '/app' || href === '/admin' ? pathname === href : pathname.startsWith(href));
  const brandName = session.tenant?.name ?? 'OdontoSis';

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-line px-4">
        {session.tenant?.logoFileId
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/api/files/${session.tenant.logoFileId}`} alt="" className="size-9 rounded-lg object-contain" />
          : <div className="grid size-9 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-contrast">{brandName.slice(0, 2).toUpperCase()}</div>}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{brandName}</p>
          <p className="truncate text-xs text-muted">{session.isPlatform ? 'Administración de plataforma' : session.roleName}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Principal">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
            aria-current={isActive(n.href) ? 'page' : undefined}
            className={cx('flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors',
              isActive(n.href) ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
            {n.icon}<span className="flex-1">{n.label}</span>
            {(() => {
              const b = badgeOf(n.badge);
              return b && b.n > 0 ? (
                <span className={cx('grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-none', b.tone)} title={b.label} aria-label={b.label}>
                  {badgeText(b.n)}
                </span>
              ) : null;
            })()}
          </Link>
        ))}
      </nav>
      <div className="border-t border-line p-3">
        <Link href="/account/security" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-control px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
          <ShieldCheck className="size-5" /> Mi cuenta y seguridad
        </Link>
        <button onClick={() => logout(session.tenant?.code)} className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
          <LogOut className="size-5" /> Cerrar sesión
        </button>
        <button type="button" onClick={() => { setOpen(false); setProfileOpen(true); }} aria-label="Personalizar avatar y apodo"
          className="group mt-2 flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left hover:bg-surface-2" title="Cambiar avatar y apodo">
          <UserAvatar avatar={session.avatar} name={session.fullName} size={32} className="transition-transform group-hover:scale-110" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{displayName(session)}</span>
            <span className="block truncate text-xs text-subtle">{session.nickname ? session.fullName : session.roleName}</span>
          </span>
          <span className="text-xs text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>Editar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">{sidebar}</aside>
      <ProfileQuickModal open={profileOpen} onClose={() => setProfileOpen(false)} session={session} />

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-modal">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-md p-1 text-muted" aria-label="Cerrar menú"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-8">
        <button onClick={() => setOpen(true)} className="relative rounded-md p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label={nav.some((n) => (badgeOf(n.badge)?.n ?? 0) > 0) ? 'Abrir menú (hay pendientes)' : 'Abrir menú'}>
          <Menu className="size-5" />
          {nav.some((n) => (badgeOf(n.badge)?.n ?? 0) > 0) && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-surface" />}
        </button>
        <div className="flex-1" />
        {!session.isPlatform && <SyncIndicator />}
        <NotificationBell timezone={session.tenant?.timezone} />
      </header>

      <AccessBanner session={session} />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}

/** Aviso de periodo de implementación o de contrato por vencer */
function AccessBanner({ session }: { session: ClientSession }) {
  const a = session.tenant?.access;
  if (!a) return null;
  if (a.phase === 'IMPLEMENTATION') {
    return (
      <div role="status" className="no-print flex flex-col gap-2 border-b border-accent/40 bg-accent/10 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <p className="flex items-center gap-2">
          <FlaskConical className="size-4 shrink-0" />
          <span><strong>Periodo de implementación</strong> · {a.daysLeft === 0 ? 'último día' : `quedan ${a.daysLeft} día${a.daysLeft === 1 ? '' : 's'}`} (hasta {formatDate(a.until)}). Úsalo para capacitarte, cargar datos y probar. Los presupuestos impresos llevan marca de agua.</span>
        </p>
        <Link href="/app/requests?new=1" className="shrink-0 font-medium text-brand hover:underline">Solicitar mejora o ayuda →</Link>
      </div>
    );
  }
  if (a.phase === 'PRODUCTION' && a.daysLeft !== null && a.daysLeft <= 15) {
    return (
      <div role="status" className="no-print border-b border-warning/40 bg-warning/10 px-4 py-2.5 text-sm lg:px-8">
        El contrato de la clínica vence el <strong>{formatDate(a.until)}</strong> ({a.daysLeft} día{a.daysLeft === 1 ? '' : 's'}). Comunícate con OdontoSis para renovarlo.
      </div>
    );
  }
  return null;
}

function SyncIndicator() {
  const { online, syncing, pending, failed, lastSync, syncNow } = useApp();
  const label = !online ? 'Sin conexión' : syncing ? 'Sincronizando…' : pending ? `${pending} pendiente(s)` : 'Sincronizado';
  return (
    <div className="flex items-center gap-2">
      {failed > 0 && (
        <Link href="/app/sync" className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
          <AlertTriangle className="size-3.5" /> {failed} con error
        </Link>
      )}
      <button onClick={() => void syncNow()} title={lastSync ? `Última sincronización: ${formatDateTime(lastSync)}` : undefined}
        className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          online ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning')}>
        {syncing ? <RefreshCw className="size-3.5 animate-spin" /> : online ? <Cloud className="size-3.5" /> : <CloudOff className="size-3.5" />}
        <span>{label}</span>
      </button>
    </div>
  );
}

export function BrandStyle({ session }: { session: ClientSession }) {
  const t = session.tenant;
  if (!t) return null;
  const hex = (v: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#0e7490');
  const contrast = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? '#0f172a' : '#ffffff';
  };
  const css = `:root{--brand:${hex(t.primaryColor)};--accent:${hex(t.secondaryColor)};--brand-contrast:${contrast(hex(t.primaryColor))}}`;
  return <style>{css}</style>;
}

export type { ClientSession };
