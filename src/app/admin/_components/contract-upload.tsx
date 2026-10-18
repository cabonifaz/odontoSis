'use client';
import { useId, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { Field } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';

export type UploadedFile = { id: string; name: string };

const MAX = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';

/** Adjunto del contrato firmado (PDF o imagen ≤ 10 MB). Sube al seleccionar (kind=CONTRACT) y devuelve el id. */
export function ContractUpload({ label = 'Contrato firmado', value, onChange, error, required }: {
  label?: string; value: UploadedFile | null; onChange: (f: UploadedFile | null) => void; error?: string | null; required?: boolean;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function upload(file: File) {
    setLocalError(null);
    if (file.size > MAX) { setLocalError('El archivo debe pesar máximo 10 MB.'); return; }
    if (!ACCEPT.split(',').includes(file.type)) { setLocalError('Usa PDF, PNG, JPG o WEBP.'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'CONTRACT');
      const r = await api<{ id: string }>('/api/files', { form });
      onChange({ id: r.id, name: file.name });
    } catch (e) {
      setLocalError(e instanceof ApiError ? e.message : 'No se pudo subir el archivo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label} required={required} error={localError ?? error} hint="PDF o imagen · máx. 10 MB" htmlFor={inputId}>
      {value ? (
        <div className="flex h-10 items-center gap-2 rounded-control border border-line bg-surface-2 px-3 text-sm">
          <FileText className="size-4 shrink-0 text-brand" aria-hidden />
          <a href={`/api/files/${value.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-brand hover:underline">{value.name}</a>
          <button type="button" aria-label="Quitar archivo del contrato" onClick={() => onChange(null)} className="text-muted hover:text-danger"><X className="size-4" /></button>
        </div>
      ) : (
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-control border border-dashed border-line-strong px-3 text-sm text-muted focus-within:ring-2 focus-within:ring-ring hover:border-brand hover:text-brand">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
          {busy ? 'Subiendo…' : 'Adjuntar contrato'}
          <input id={inputId} type="file" accept={ACCEPT} className="sr-only" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
        </label>
      )}
    </Field>
  );
}
