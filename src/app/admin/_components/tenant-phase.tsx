'use client';
import { Badge } from '@/components/ui';
import { formatDate, todayIn } from '@/lib/shared/format';
import { tenantAccess, type TenantAccess } from '@/lib/shared/types';

export const BLOCK_REASONS: Record<string, string> = {
  NO_CONTRACT: 'Sin contrato',
  CONTRACT_NOT_STARTED: 'Contrato aún no inicia',
  CONTRACT_EXPIRED: 'Contrato vencido',
  IMPLEMENTATION_ENDED: 'Implementación vencida',
  IMPLEMENTATION_NOT_STARTED: 'Implementación no iniciada',
  SUSPENDED: 'Suspendida',
  CANCELLED: 'Cancelada',
};

export type PhaseInput = {
  status_code: string; timezone?: string | null;
  subscription_start: string | null; subscription_end: string | null;
  implementation_start: string | null; implementation_end: string | null;
};

function safeToday(tz?: string | null) {
  try { return todayIn(tz || 'America/Lima'); } catch { return todayIn(); }
}

export function computeAccess(t: PhaseInput): TenantAccess {
  return tenantAccess({
    status: t.status_code,
    subscriptionStart: t.subscription_start, subscriptionEnd: t.subscription_end,
    implementationStart: t.implementation_start, implementationEnd: t.implementation_end,
  }, safeToday(t.timezone));
}

const days = (n: number) => (n === 1 ? '1 día restante' : n === 0 ? 'último día' : `${n} días restantes`);

/** Etiqueta y color de la fase de acceso calculada. */
export function phaseInfo(a: TenantAccess): { label: string; color: string } {
  if (a.phase === 'IMPLEMENTATION') return { label: `Implementación — ${days(a.daysLeft ?? 0)}`, color: '#0EA5E9' };
  if (a.phase === 'PRODUCTION') return { label: `Producción — contrato hasta ${formatDate(a.until)}`, color: '#16A34A' };
  return { label: `Bloqueada — ${BLOCK_REASONS[a.reason ?? ''] ?? a.reason ?? 'sin acceso'}`, color: '#DC2626' };
}

export function PhaseBadge({ tenant, className }: { tenant: PhaseInput; className?: string }) {
  const info = phaseInfo(computeAccess(tenant));
  return <Badge color={info.color} className={className}>{info.label}</Badge>;
}
