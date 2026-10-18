'use client';
import { useId, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, X } from 'lucide-react';
import { cx, Field } from '@/components/ui';
import { useApp } from '@/lib/client/app-context';
import type { LPatient, LService } from '@/lib/client/offline-db';
import { formatMoney } from '@/lib/shared/format';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Combobox genérico accesible sobre datos locales (funciona offline). */
export function Combo<T extends { id: string }>({ label, items, value, onChange, render, text, placeholder, required, error, clearable = true, emptyText = 'Sin resultados', onCreate, createLabel = (t: string) => `Crear «${t}»`, exactText }: {
  label?: string; items: T[]; value: string | null; onChange: (item: T | null) => void;
  render: (i: T) => React.ReactNode; text: (i: T) => string; placeholder?: string; required?: boolean; error?: string | null;
  /** false = siempre debe haber un valor (no muestra el botón de quitar) */
  clearable?: boolean;
  emptyText?: string;
  /** Si se define, ofrece crear un ítem con lo escrito cuando no hay coincidencia exacta */
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  /** Texto con el que se compara la coincidencia exacta (por defecto, text) */
  exactText?: (i: T) => string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = items.find((i) => i.id === value) ?? null;
  const results = useMemo(() => {
    const n = norm(q.trim());
    return (n ? items.filter((i) => norm(text(i)).includes(n)) : items).slice(0, 30);
  }, [items, q, text]);

  const pick = (i: T) => { onChange(i); setQ(''); setOpen(false); };
  const typed = q.trim();
  const canCreate = !!onCreate && typed.length >= 2 && !items.some((i) => norm((exactText ?? text)(i).trim()) === norm(typed));
  const create = () => { onCreate?.(typed); setQ(''); setOpen(false); };

  return (
    <Field label={label} required={required} error={error}>
      <div className="relative">
        {selected && !open ? (
          <div className="flex h-10 items-center justify-between rounded-control border border-line bg-surface px-3 text-sm">
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus()); }}>{render(selected)}</button>
            {clearable && <button type="button" aria-label="Quitar" onClick={() => onChange(null)} className="text-muted hover:text-fg"><X className="size-4" /></button>}
          </div>
        ) : (
          <>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input ref={ref} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" value={q} placeholder={placeholder}
              className="h-10 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring"
              onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
              onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]); }
                else if (e.key === 'Enter' && canCreate) { e.preventDefault(); create(); }
                if (e.key === 'Escape') setOpen(false);
              }} />
          </>
        )}
        {open && (
          <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-control border border-line bg-surface py-1 shadow-pop">
            {canCreate && (
              <li role="option" aria-selected={results.length === 0} onMouseDown={(e) => { e.preventDefault(); create(); }}
                className="cursor-pointer border-b border-line px-3 py-2 text-sm font-medium text-brand hover:bg-brand-soft">
                + {createLabel(typed)}
              </li>
            )}
            {results.length === 0 ? (!canCreate && <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>) : results.map((i, idx) => (
              <li key={i.id} role="option" aria-selected={idx === active}
                onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                className={cx('cursor-pointer px-3 py-2 text-sm', idx === active ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                {render(i)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

export function PatientPicker({ value, onChange, label = 'Paciente', required, error, excludeIds }: {
  value: string | null; onChange: (p: LPatient | null) => void; label?: string; required?: boolean; error?: string | null;
  /** pacientes que no se pueden elegir (p. ej. el propio paciente al elegir su apoderado) */
  excludeIds?: string[];
}) {
  const { db } = useApp();
  const all = useLiveQuery(async () => db?.patients.orderBy('last_name').filter((p) => !!p.is_active).toArray(), [db]) ?? [];
  const items = excludeIds?.length ? all.filter((p) => !excludeIds.includes(p.id)) : all;
  return (
    <Combo label={label} items={items} value={value} onChange={onChange} required={required} error={error} placeholder="Buscar paciente por nombre o H.C."
      text={(p) => `${p.last_name} ${p.mother_last_name ?? ''} ${p.first_name} ${p.first_name} ${p.last_name} ${p.record_number ?? ''}`}
      render={(p) => <span><span className="font-medium">{[p.last_name, p.mother_last_name].filter(Boolean).join(' ')}, {p.first_name}</span> <span className="text-xs text-muted">H.C. {p.record_number ?? 'pendiente'}</span></span>} />
  );
}

export function ServicePicker({ value, onChange, label = 'Tratamiento', symbol }: {
  value: string | null; onChange: (s: LService | null) => void; label?: string; symbol: string;
}) {
  const { db } = useApp();
  const items = useLiveQuery(async () => db?.services.orderBy('name').filter((s) => !!s.is_active).toArray(), [db]) ?? [];
  return (
    <Combo label={label} items={items} value={value} onChange={onChange} placeholder="Buscar en la lista de precios"
      text={(s) => `${s.code} ${s.name}`}
      render={(s) => <span className="flex justify-between gap-3"><span><span className="text-xs text-muted">{s.code}</span> {s.name}</span><span className="tabular-nums text-muted">{formatMoney(s.price, symbol)}</span></span>} />
  );
}
