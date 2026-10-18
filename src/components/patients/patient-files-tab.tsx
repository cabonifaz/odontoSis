'use client';
import { useCallback, useEffect, useId, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { CloudOff, Download, ExternalLink, FileText, ImageIcon, Images, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea, cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useMasters } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDate } from '@/lib/shared/format';
import {
  PATIENT_FILE_ACCEPT, PATIENT_FILE_MAX_BYTES, PATIENT_FILE_MIME, patientFileMetaSchema, type PatientFile,
} from '@/lib/shared/patient-file-schemas';

const isImage = (mime: string) => mime.startsWith('image/');
const fileUrl = (fileId: string, download = false) => `/api/files/${fileId}${download ? '?download=1' : ''}`;
const formatSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Pestaña "Imágenes y archivos" de la ficha del paciente (requiere conexión: no funciona offline). */
export function PatientFilesTab({ patientId, writable }: { patientId: string; writable: boolean }) {
  const { online, session } = useApp();
  const toast = useToast();
  const tz = session.tenant?.timezone;
  const [files, setFiles] = useState<PatientFile[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<PatientFile | null>(null);
  const [toDelete, setToDelete] = useState<PatientFile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await api<{ files: PatientFile[] }>(`/api/patients/${patientId}/files`);
      setFiles(r.files);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) setOffline(true);
      else setLoadError(e instanceof ApiError ? e.message : 'No se pudieron cargar los archivos.');
    }
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);
  // Al recuperar la conexión se vuelve a cargar
  useEffect(() => { if (online && offline) void load(); }, [online, offline, load]);

  // Filtros: sólo los tipos que tienen archivos
  const types = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const f of files ?? []) {
      const t = m.get(f.typeId) ?? { id: f.typeId, name: f.typeName, count: 0 };
      t.count++;
      m.set(f.typeId, t);
    }
    return [...m.values()];
  }, [files]);
  const shown = useMemo(() => (files ?? []).filter((f) => !filter || f.typeId === filter), [files, filter]);

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/api/patients/${patientId}/files/${toDelete.id}`, { method: 'DELETE' });
      setFiles((fs) => (fs ?? []).filter((f) => f.id !== toDelete.id));
      if (preview?.id === toDelete.id) setPreview(null);
      setToDelete(null);
      toast.success('Archivo eliminado.');
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.isNetwork ? 'Sin conexión. Inténtalo cuando vuelvas a estar en línea.' : e.message) : 'Error');
    } finally {
      setDeleting(false);
    }
  }

  if ((!online || offline) && !files) {
    return (
      <Card>
        <EmptyState icon={<CloudOff className="size-6" />} title="Sin conexión"
          description="Las imágenes y archivos del paciente sólo están disponibles con conexión a internet. Se cargarán automáticamente al reconectar."
          action={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => void load()}>Reintentar</Button>} />
      </Card>
    );
  }
  if (loadError) {
    return (
      <Card>
        <EmptyState title="No se pudieron cargar los archivos" description={loadError}
          action={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={() => void load()}>Reintentar</Button>} />
      </Card>
    );
  }
  if (!files) return <Card><Spinner /></Card>;

  return (
    <Card className="p-4 sm:p-5">
      {!online && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-sm text-muted">
          <CloudOff className="size-4 shrink-0" /> Sin conexión: no se pueden subir ni ver archivos nuevos hasta reconectar.
        </p>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
          <FilterChip active={!filter} onClick={() => setFilter('')} label={`Todos (${files.length})`} />
          {types.map((t) => <FilterChip key={t.id} active={filter === t.id} onClick={() => setFilter(t.id)} label={`${t.name} (${t.count})`} />)}
        </div>
        {writable && (
          <Button icon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)} disabled={!online} className="shrink-0">
            Subir archivo
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Images className="size-6" />}
          title={files.length === 0 ? 'Sin imágenes ni archivos' : 'No hay archivos de este tipo'}
          description={files.length === 0 ? 'Sube radiografías, fotografías clínicas, consentimientos o resultados de laboratorio.' : undefined}
          action={writable && files.length === 0 && online
            ? <Button icon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>Subir archivo</Button> : undefined} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Archivos del paciente">
          {shown.map((f) => (
            <li key={f.id} className="group relative overflow-hidden rounded-card border border-line bg-surface">
              <button type="button" onClick={() => setPreview(f)} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Ver ${f.title}`}>
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-surface-2">
                  {isImage(f.mimeType) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la API (sin optimizador)
                    <img src={fileUrl(f.fileId)} alt={f.title} loading="lazy" className="size-full object-cover transition-transform duration-200 group-hover:scale-105" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-3 text-center text-muted">
                      <FileText className="size-10 text-danger" aria-hidden />
                      <span className="line-clamp-2 break-all text-xs">{f.originalName}</span>
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-medium text-fg">{f.title}</p>
                  <p className="truncate text-xs text-muted">
                    {f.typeName}{f.toothCode ? ` · Pieza ${f.toothCode}` : ''}
                  </p>
                  <p className="text-xs text-subtle">{formatDate(f.takenAt ?? f.createdAt, tz)}</p>
                </div>
              </button>
              {writable && (
                <button type="button" onClick={() => setToDelete(f)} aria-label={`Eliminar ${f.title}`}
                  className="absolute right-1.5 top-1.5 rounded-md bg-surface/90 p-1.5 text-muted shadow-card hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {writable && (
        <UploadModal open={uploadOpen} patientId={patientId} onClose={() => setUploadOpen(false)}
          onUploaded={(rec) => {
            if (rec) setFiles((fs) => [rec, ...(fs ?? [])]); else void load();
            setFilter('');
          }} />
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? ''} size="xl"
        footer={preview && (
          <>
            {writable && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={() => setToDelete(preview)}>Eliminar</Button>}
            <a href={fileUrl(preview.fileId, true)} className="inline-flex h-10 items-center gap-2 rounded-control border border-line px-4 text-sm font-medium hover:bg-surface-2">
              <Download className="size-4" /> Descargar
            </a>
            <a href={fileUrl(preview.fileId)} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-control bg-brand px-4 text-sm font-medium text-brand-contrast hover:bg-brand-hover">
              <ExternalLink className="size-4" /> Abrir
            </a>
          </>
        )}>
        {preview && (
          <div className="flex flex-col gap-4">
            {isImage(preview.mimeType) ? (
              <div className="flex justify-center rounded-control bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la API */}
                <img src={fileUrl(preview.fileId)} alt={preview.title} className="max-h-[65dvh] w-auto object-contain" />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-control bg-surface-2 px-4 py-10 text-center">
                <FileText className="size-14 text-danger" aria-hidden />
                <p className="break-all text-sm font-medium">{preview.originalName}</p>
                <a href={fileUrl(preview.fileId)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
                  <ExternalLink className="size-4" /> Abrir PDF en una pestaña nueva
                </a>
              </div>
            )}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Meta k="Tipo" v={preview.typeName} />
              <Meta k="Fecha" v={formatDate(preview.takenAt ?? preview.createdAt, tz)} />
              <Meta k="Pieza dental" v={preview.toothCode} />
              <Meta k="Archivo" v={`${preview.originalName} · ${formatSize(preview.sizeBytes)}`} />
              <Meta k="Subido por" v={preview.createdByName} />
              {preview.description && <Meta k="Descripción" v={preview.description} wide />}
            </dl>
          </div>
        )}
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar archivo" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleting} onClick={remove}>Eliminar</Button>
        </>}>
        <p className="text-sm">¿Eliminar <strong>{toDelete?.title}</strong> de la ficha del paciente? Quedará registrado en la auditoría.</p>
      </Modal>
    </Card>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={cx('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-fg')}>
      {label}
    </button>
  );
}

function Meta({ k, v, wide }: { k: string; v: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-muted">{k}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words">{v || '—'}</dd>
    </div>
  );
}

type FormState = { typeId: string; title: string; description: string; takenAt: string; toothCode: string };
const emptyForm = (): FormState => ({ typeId: '', title: '', description: '', takenAt: '', toothCode: '' });

function UploadModal({ open, patientId, onClose, onUploaded }: {
  open: boolean; patientId: string; onClose: () => void; onUploaded: (rec: PatientFile | null) => void;
}) {
  const toast = useToast();
  const types = useMasters('PATIENT_FILE_TYPE');
  const inputId = useId();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setForm(emptyForm()); setFile(null); setErrors({}); } }, [open]);
  useEffect(() => {
    if (!file || !isImage(file.type)) { setThumb(null); return; }
    const url = URL.createObjectURL(file);
    setThumb(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!(PATIENT_FILE_MIME as readonly string[]).includes(f.type)) {
      setErrors((e) => ({ ...e, file: 'Formato no permitido. Usa JPG, PNG, WEBP o PDF.' })); return;
    }
    if (f.size === 0 || f.size > PATIENT_FILE_MAX_BYTES) {
      setErrors((e) => ({ ...e, file: 'El archivo debe pesar máximo 15 MB.' })); return;
    }
    setErrors(({ file: _f, ...rest }) => rest);
    setFile(f);
    // Sugerir el título a partir del nombre del archivo
    setForm((s) => (s.title ? s : { ...s, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 150) }));
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = patientFileMetaSchema.safeParse(form);
    const errs: Record<string, string> = {};
    if (!file) errs.file = 'Selecciona un archivo.';
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    setErrors(errs);
    if (Object.keys(errs).length || !file || !parsed.success) return;

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('typeId', parsed.data.typeId);
      fd.append('title', parsed.data.title);
      if (parsed.data.description) fd.append('description', parsed.data.description);
      if (parsed.data.takenAt) fd.append('takenAt', parsed.data.takenAt);
      if (parsed.data.toothCode) fd.append('toothCode', parsed.data.toothCode);
      const r = await api<{ record: PatientFile | null }>(`/api/patients/${patientId}/files/upload`, { form: fd });
      toast.success('Archivo subido.');
      onUploaded(r.record);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) toast.error('Sin conexión. Sube el archivo cuando vuelvas a estar en línea.');
      else {
        const fe = fieldErrors(err);
        if (Object.keys(fe).length) setErrors(fe);
        toast.error(err instanceof ApiError ? err.message : 'No se pudo subir el archivo.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Subir imagen o archivo" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button type="submit" form={`${inputId}-form`} loading={saving} icon={<Upload className="size-4" />}>Subir</Button>
      </>}>
      <form id={`${inputId}-form`} onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Archivo" required error={errors.file} hint="JPG, PNG, WEBP o PDF · máx. 15 MB" htmlFor={inputId} className="sm:col-span-2">
          {file ? (
            <div className="flex items-center gap-3 rounded-control border border-line bg-surface-2 p-2">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
                {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : isImage(file.type) ? <ImageIcon className="size-6 text-muted" /> : <FileText className="size-6 text-danger" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted">{formatSize(file.size)}</p>
              </div>
              <button type="button" onClick={() => setFile(null)} aria-label="Quitar archivo" className="rounded-md p-1 text-muted hover:text-danger" disabled={saving}>
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label htmlFor={inputId}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-control border-2 border-dashed px-4 py-8 text-center text-sm transition-colors',
                dragging ? 'border-brand bg-brand-soft text-brand' : 'border-line-strong text-muted hover:border-brand hover:text-brand')}>
              <Upload className="size-6" aria-hidden />
              <span><strong className="font-medium">Arrastra el archivo aquí</strong> o haz clic para seleccionarlo</span>
              <input id={inputId} type="file" accept={PATIENT_FILE_ACCEPT} className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
            </label>
          )}
        </Field>
        <Select label="Tipo" required value={form.typeId} onChange={(e) => set('typeId')(e.target.value)} error={errors.typeId}
          placeholder="Selecciona…" options={types.map((t) => ({ value: t.id, label: t.name }))} />
        <Input label="Título" required maxLength={150} value={form.title} onChange={(e) => set('title')(e.target.value)} error={errors.title}
          placeholder="Ej. Radiografía periapical" />
        <Input label="Fecha de la toma" type="date" value={form.takenAt} onChange={(e) => set('takenAt')(e.target.value)} error={errors.takenAt}
          max={new Date().toISOString().slice(0, 10)} />
        <Input label="Pieza dental (opcional)" value={form.toothCode} onChange={(e) => set('toothCode')(e.target.value)} error={errors.toothCode}
          placeholder="Ej. 4.5" maxLength={4} inputMode="decimal" hint="Notación FDI" />
        <Textarea label="Descripción" className="sm:col-span-2" maxLength={500} value={form.description}
          onChange={(e) => set('description')(e.target.value)} error={errors.description} placeholder="Observaciones (opcional)" />
      </form>
    </Modal>
  );
}
