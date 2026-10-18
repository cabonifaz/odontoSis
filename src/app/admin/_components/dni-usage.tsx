'use client';
import Link from 'next/link';
import { AlertTriangle, IdCard } from 'lucide-react';
import { Card, cx } from '@/components/ui';
import { formatDate, parseDbDate } from '@/lib/shared/format';

export type DniUsage = {
  enabled: boolean;
  summary: { used: number; found: number; not_found: number; failed: number; quota: number; alert_pct: number; cycle_day: number; tenant_cap: number; user_cap: number; cycle_start: string; cycle_end: string; last_at: string | null };
  byTenant: { tenant_id: string | null; tenant_name: string; used: number; last_at: string }[];
  byDay: { day: string; used: number }[];
  history: { cycle_start: string; cycle_end: string; used: number }[];
};

/** Nivel de consumo: ok, alerta (≥ % configurado) o agotado */
export function dniLevel(s: DniUsage['summary']) {
  const used = Number(s.used), quota = Number(s.quota);
  const pct = quota > 0 ? Math.round((used / quota) * 100) : 100;
  const level = used >= quota ? 'out' : pct >= Number(s.alert_pct) ? 'warn' : 'ok';
  return { used, quota, pct, level, remaining: Math.max(0, quota - used) } as const;
}

/** Proyección al cierre del ciclo según el ritmo actual, y fecha estimada de agotamiento */
export function dniProjection(s: DniUsage['summary']) {
  const start = parseDbDate(s.cycle_start)!.getTime(), end = parseDbDate(s.cycle_end)!.getTime();
  const elapsedDays = Math.max(1, (Date.now() - start) / 86_400_000);
  const totalDays = (end - start) / 86_400_000;
  const perDay = Number(s.used) / elapsedDays;
  const projected = Math.round(perDay * totalDays);
  const quota = Number(s.quota), used = Number(s.used);
  const runsOutAt = perDay > 0 && used < quota ? new Date(Date.now() + ((quota - used) / perDay) * 86_400_000) : null;
  return { perDay, projected, runsOutAt: runsOutAt && runsOutAt.getTime() < end ? runsOutAt : null, daysLeft: Math.ceil((end - Date.now()) / 86_400_000) };
}

const BAR = { ok: 'bg-success', warn: 'bg-warning', out: 'bg-danger' } as const;

export function DniMeter({ s }: { s: DniUsage['summary'] }) {
  const l = dniLevel(s);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span><span className="text-2xl font-semibold tabular-nums">{l.used}</span> <span className="text-muted">/ {l.quota} consultas</span></span>
        <span className={cx('font-semibold tabular-nums', l.level === 'out' ? 'text-danger' : l.level === 'warn' ? 'text-warning' : 'text-muted')}>{l.pct}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Consumo de consultas de DNI"
        aria-valuemin={0} aria-valuemax={l.quota} aria-valuenow={l.used}>
        <div className={cx('h-full rounded-full transition-[width]', BAR[l.level])} style={{ width: `${Math.min(100, l.pct)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted">Ciclo del {formatDate(s.cycle_start)} al {formatDate(new Date(parseDbDate(s.cycle_end)!.getTime() - 1))} · quedan {l.remaining}</p>
    </div>
  );
}

/** Aviso para ampliar el plan antes de quedarse sin consultas */
export function DniAlert({ u }: { u: DniUsage }) {
  const l = dniLevel(u.summary);
  const p = dniProjection(u.summary);
  const willRunOut = l.level === 'ok' && p.runsOutAt && p.projected > l.quota;
  if (l.level === 'ok' && !willRunOut) return null;
  const msg = l.level === 'out'
    ? 'Se agotó el cupo de consultas de DNI de este ciclo. Los usuarios deben ingresar los datos manualmente hasta la renovación o hasta ampliar el plan.'
    : l.level === 'warn'
      ? `Se consumió el ${l.pct}% del cupo de consultas de DNI.${p.runsOutAt ? ` A este ritmo se agotará el ${formatDate(p.runsOutAt)}.` : ''} Considera ampliar el plan en Decolecta.`
      : `Al ritmo actual se proyectan ${p.projected} consultas en el ciclo (cupo ${l.quota}); se agotaría el ${formatDate(p.runsOutAt)}. Considera ampliar el plan.`;
  return (
    <div role="alert" className={cx('flex items-start gap-3 rounded-card border p-4 text-sm',
      l.level === 'out' ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10')}>
      <AlertTriangle className={cx('mt-0.5 size-4 shrink-0', l.level === 'out' ? 'text-danger' : 'text-warning')} aria-hidden />
      <p className="flex-1">{msg}</p>
    </div>
  );
}

/** Tarjeta compacta para el resumen de plataforma */
export function DniUsageCard({ u }: { u: DniUsage }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><IdCard className="size-4 text-brand" aria-hidden /> Consultas de DNI</h2>
        <Link href="/admin/dni" className="text-sm text-brand hover:underline">Ver detalle →</Link>
      </div>
      {!u.enabled ? <p className="text-sm text-muted">La consulta de DNI no está configurada en este ambiente.</p> : <DniMeter s={u.summary} />}
    </Card>
  );
}
