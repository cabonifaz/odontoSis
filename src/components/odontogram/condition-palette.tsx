'use client';
import { MousePointer2 } from 'lucide-react';
import { cx } from '@/components/ui';
import type { Condition, Mark, Surface } from './odontogram';

/** Paleta de hallazgos. value=null => modo selección (para agregar tratamientos). */
export function ConditionPalette({ conditions, value, onChange, allowSelect }: {
  conditions: Condition[]; value: string | null; onChange: (id: string | null) => void; allowSelect?: boolean;
}) {
  const btn = (active: boolean) => cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface text-muted hover:text-fg');
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Herramienta del odontograma">
      {allowSelect && (
        <button type="button" role="radio" aria-checked={value === null} className={btn(value === null)} onClick={() => onChange(null)}>
          <MousePointer2 className="size-3.5" /> Seleccionar pieza
        </button>
      )}
      {conditions.map((c) => (
        <button key={c.id} type="button" role="radio" aria-checked={value === c.id} className={btn(value === c.id)} onClick={() => onChange(c.id)}>
          <span className={cx('size-2.5', c.scope === 'surface' ? 'rounded-sm' : 'rounded-full')} style={{ backgroundColor: c.color }} aria-hidden />
          {c.name}
        </button>
      ))}
    </div>
  );
}

/** Aplica/quita un hallazgo (toggle) y devuelve la nueva lista de marcas. */
export function toggleMark(marks: Mark[], c: Condition, toothCode: string, surface: Surface | null): Mark[] {
  const s = c.scope === 'tooth' ? null : surface;
  if (c.scope === 'surface' && !s) return marks;
  const exists = marks.some((m) => m.toothCode === toothCode && m.surface === s && m.conditionId === c.id);
  if (exists) return marks.filter((m) => !(m.toothCode === toothCode && m.surface === s && m.conditionId === c.id));
  // una superficie sólo tiene un hallazgo de superficie a la vez
  const cleaned = s ? marks.filter((m) => !(m.toothCode === toothCode && m.surface === s)) : marks;
  return [...cleaned, { toothCode, surface: s, conditionId: c.id }];
}
