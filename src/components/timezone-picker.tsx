'use client';
import { useMemo } from 'react';
import { Combo } from '@/components/pickers';

type Tz = { id: string; offset: string; minutes: number };

const PRIORITY = ['America/Lima', 'America/Bogota', 'America/Guayaquil', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Guatemala', 'Europe/Madrid'];

function offsetOf(tz: string): { offset: string; minutes: number } {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return { offset: 'UTC±00:00', minutes: 0 };
  const minutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  return { offset: `UTC${m[1] === '-' ? '−' : '+'}${m[2].padStart(2, '0')}:${m[3] ?? '00'}`, minutes };
}

function allZones(): Tz[] {
  const list: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : PRIORITY;
  const zones = list.map((id) => ({ id, ...offsetOf(id) }));
  // Primero las zonas habituales de la región; luego el resto por desfase y nombre
  return zones.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.id), pb = PRIORITY.indexOf(b.id);
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return a.minutes - b.minutes || a.id.localeCompare(b.id);
  });
}

/** Combo con buscador de zonas horarias IANA (ej. "lima", "bogota", "-05"). */
export function TimezonePicker({ value, onChange, label = 'Zona horaria', error, required }: {
  value: string; onChange: (tz: string) => void; label?: string; error?: string | null; required?: boolean;
}) {
  const zones = useMemo(() => {
    const z = allZones();
    // Conserva un valor guardado que el navegador no liste (alias antiguos)
    return value && !z.some((x) => x.id === value) ? [{ id: value, ...offsetOf(value) }, ...z] : z;
  }, [value]);

  return (
    <Combo<Tz>
      label={label} required={required} error={error} items={zones} value={value || null} clearable={false}
      placeholder="Buscar ciudad o desfase (ej. Lima, -05)"
      onChange={(z) => z && onChange(z.id)}
      text={(z) => `${z.id.replace(/_/g, ' ')} ${z.offset} ${z.offset.replace('−', '-')}`}
      render={(z) => (
        <span className="flex justify-between gap-3">
          <span className="truncate">{z.id.replace(/_/g, ' ')}</span>
          <span className="shrink-0 tabular-nums text-muted">{z.offset}</span>
        </span>
      )}
    />
  );
}
