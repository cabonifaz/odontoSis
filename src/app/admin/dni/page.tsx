'use client';
import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button, Card, EmptyState, Input, Modal, PageHeader, Spinner, Stat } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDate, formatDateTime, parseDbDate } from '@/lib/shared/format';
import { DniAlert, DniMeter, dniProjection, type DniUsage } from '../_components/dni-usage';

type Form = { quota: string; alertPct: string; cycleDay: string };

/** Control del cupo mensual de la consulta de DNI (plan del proveedor) para ampliar el plan a tiempo. */
export default function DniUsagePage() {
  const toast = useToast();
  const [u, setU] = useState<DniUsage | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api<DniUsage>('/api/admin/dni-usage').then(setU)
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar el consumo.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!form) return;
    try {
      setU(await api<DniUsage>('/api/admin/dni-usage', { method: 'PUT', body: form }));
      setForm(null);
      toast.success('Plan de consultas actualizado.');
    } catch (e) { setErrors(fieldErrors(e)); toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  if (!u) return <><PageHeader title="Consultas de DNI" /><Spinner /></>;
  const s = u.summary;
  const p = dniProjection(s);
  const maxDay = Math.max(1, ...u.byDay.map((d) => Number(d.used)));

  return (
    <>
      <PageHeader title="Consultas de DNI" subtitle="Consumo del plan contratado con Decolecta (RENIEC)"
        actions={<Button variant="secondary" icon={<Settings2 className="size-4" />}
          onClick={() => { setErrors({}); setForm({ quota: String(s.quota), alertPct: String(s.alert_pct), cycleDay: String(s.cycle_day) }); }}>Plan contratado</Button>} />
      {!u.enabled && <p className="mb-4 rounded-card border border-line bg-surface-2 p-4 text-sm text-muted">La consulta de DNI no está configurada en este ambiente (falta DNI_API_TOKEN).</p>}
      <div className="mb-4"><DniAlert u={u} /></div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <Card className="p-5"><DniMeter s={s} /></Card>
        <Stat label="Proyección al cierre" value={p.projected} hint={`${p.perDay.toFixed(1)} por día en promedio`} />
        <Stat label="Días para renovar" value={Math.max(0, p.daysLeft)} hint={`Renueva el día ${s.cycle_day} de cada mes`} />
        <Stat label="Resultados" value={`${s.found} / ${s.not_found}`} hint={`encontrados / sin datos${Number(s.failed) ? ` · ${s.failed} fallidas (no consumen)` : ''}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="font-semibold">Consumo por clínica (ciclo actual)</h2></div>
          {u.byTenant.length === 0 ? <EmptyState title="Sin consultas en este ciclo" /> : (
            <ul className="divide-y divide-line">
              {u.byTenant.map((t) => (
                <li key={t.tenant_id ?? 'platform'} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{t.tenant_name}</span>
                  <span className="text-xs text-muted">última {formatDateTime(t.last_at)}</span>
                  <span className="w-10 text-right font-semibold tabular-nums">{t.used}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="font-semibold">Consumo diario</h2></div>
          {u.byDay.length === 0 ? <EmptyState title="Sin consultas en este ciclo" /> : (
            <ul className="space-y-1.5 p-5">
              {u.byDay.map((d) => (
                <li key={d.day} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-muted">{formatDate(`${d.day} 12:00:00`)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(Number(d.used) / maxDay) * 100}%` }} />
                  </span>
                  <span className="w-8 text-right tabular-nums">{d.used}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="border-b border-line px-5 py-4"><h2 className="font-semibold">Histórico por ciclo</h2></div>
        <ul className="divide-y divide-line">
          {u.history.map((h, i) => (
            <li key={h.cycle_start} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="flex-1">{formatDate(h.cycle_start)} – {formatDate(new Date(parseDbDate(h.cycle_end)!.getTime() - 1))}{i === 0 && <span className="ml-2 text-xs text-brand">actual</span>}</span>
              <span className="font-semibold tabular-nums">{h.used}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="Plan de consultas de DNI"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Guardar</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Consultas por mes" required type="number" min={0} value={form.quota} onChange={(e) => setForm({ ...form, quota: e.target.value })} error={errors.quota} hint="Según el plan de Decolecta" />
            <Input label="Alertar al (%)" required type="number" min={1} max={100} value={form.alertPct} onChange={(e) => setForm({ ...form, alertPct: e.target.value })} error={errors.alertPct} />
            <Input label="Día de renovación" required type="number" min={1} max={28} value={form.cycleDay} onChange={(e) => setForm({ ...form, cycleDay: e.target.value })} error={errors.cycleDay} />
            <p className="text-xs text-muted sm:col-span-3">Al llegar al cupo, la app deja de consultar al proveedor y los usuarios ingresan los datos manualmente. Las consultas repetidas del mismo DNI en 24 h no consumen cupo.</p>
          </div>
        )}
      </Modal>
    </>
  );
}
