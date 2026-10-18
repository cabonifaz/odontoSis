'use client';
import { useEffect, useId, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Field } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';

export type DniData = { documentNumber: string; firstName: string; lastName: string; motherLastName: string; fullName: string };

let enabledCache: boolean | null = null;

/**
 * N° de documento con botón 🔍 que trae los datos de RENIEC (sólo DNI de 8 dígitos).
 * Evita errores de digitación en nombres y apellidos. Si la consulta no está configurada, el botón no aparece.
 */
export function DocumentNumberInput({ label = 'N° de documento', value, onChange, onFound, isDni, error, required, hint }: {
  label?: string; value: string; onChange: (v: string) => void; onFound: (d: DniData) => void; isDni: boolean;
  error?: string | null; required?: boolean; hint?: string;
}) {
  const id = useId();
  const [enabled, setEnabled] = useState<boolean>(enabledCache ?? false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (enabledCache !== null) return;
    api<{ enabled: boolean }>('/api/identity/dni').then((r) => { enabledCache = r.enabled; setEnabled(r.enabled); }).catch(() => {});
  }, []);

  const canSearch = enabled && isDni && /^\d{8}$/.test(value);
  async function search() {
    if (!canSearch) return;
    setLoading(true);
    setMsg(null);
    try {
      const d = await api<DniData>('/api/identity/dni', { body: { numero: value } });
      onFound(d);
      setMsg({ ok: true, text: `Datos de RENIEC: ${d.fullName}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'No se pudo consultar.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Field label={label} required={required} htmlFor={id} error={error ?? (msg && !msg.ok ? msg.text : null)}
      hint={msg?.ok ? msg.text : hint ?? (enabled && isDni ? 'Ingresa el DNI y presiona 🔍 para traer los datos de RENIEC' : undefined)}>
      <div className="flex">
        <input id={id} value={value} inputMode={isDni ? 'numeric' : undefined} maxLength={isDni ? 8 : 20}
          onChange={(e) => { onChange(isDni ? e.target.value.replace(/\D/g, '') : e.target.value); setMsg(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSearch) { e.preventDefault(); void search(); } }}
          aria-invalid={!!error || undefined}
          className="h-10 w-full rounded-l-control border border-line bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-danger" />
        {enabled && isDni && (
          <button type="button" onClick={search} disabled={!canSearch || loading} aria-label="Buscar en RENIEC" title="Buscar en RENIEC"
            className="grid w-11 shrink-0 place-items-center rounded-r-control bg-info text-white transition-opacity hover:opacity-90 disabled:opacity-40">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        )}
      </div>
    </Field>
  );
}
