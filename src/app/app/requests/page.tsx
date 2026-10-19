'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LifeBuoy, MessageSquareReply, Plus } from 'lucide-react';
import { Badge, Button, Card, cx, EmptyState, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDateTime } from '@/lib/shared/format';
import { useApp } from '@/lib/client/app-context';
import { AttachmentThumbs, ImageAttachments, type Attachment } from '@/components/image-attachments';
import { useSeenArea } from '@/lib/client/notifications';

type Req = { id: string; type_name: string; type_color: string; status_code: string; status_name: string; status_color: string; title: string; description: string; response: string | null; created_at: string; updated_at: string; created_by_name: string | null; attachments: Attachment[] | null };

const TYPES = [
  { value: 'IMPROVEMENT', label: 'Mejora (nueva función o cambio)' },
  { value: 'BUG', label: 'Error (algo no funciona)' },
  { value: 'QUESTION', label: 'Consulta' },
  { value: 'TRAINING', label: 'Capacitación' },
];

/** Solicitudes de la clínica a OdontoSis: mejoras, errores, consultas y capacitación. */
export default function RequestsPage() {
  const { session } = useApp();
  const toast = useToast();
  const params = useSearchParams();
  const [rows, setRows] = useState<Req[] | null>(null);
  const [form, setForm] = useState<{ id: string; typeCode: string; title: string; description: string; attachments: Attachment[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fresh = useSeenArea('requests');
  const highlight = params.get('highlight');

  const load = useCallback(() => { api<Req[]>('/api/requests').then(setRows).catch(() => setRows([])); }, []);
  // Desde una notificación: lleva a la solicitud
  useEffect(() => { if (rows && highlight) document.getElementById(`req-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [rows, highlight]);
  useEffect(load, [load]);
  const openNew = useCallback(() => { setErrors({}); setForm({ id: crypto.randomUUID(), typeCode: 'IMPROVEMENT', title: '', description: '', attachments: [] }); }, []);
  useEffect(() => { if (params.get('new') === '1') openNew(); }, [params, openNew]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { attachments, ...rest } = form;
      await api('/api/requests', { body: { ...rest, attachmentIds: attachments.map((a) => a.id) } });
      toast.success('Solicitud enviada. Te responderemos por este medio.');
      setForm(null);
      load();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'Error');
    } finally { setSaving(false); }
  }

  const impl = session.tenant?.access.phase === 'IMPLEMENTATION';
  return (
    <>
      <PageHeader title="Soporte y mejoras"
        subtitle={impl ? 'Estás en periodo de implementación: cuéntanos qué necesitas ajustar o mejorar.' : 'Envía mejoras, reporta errores o solicita capacitación.'}
        actions={<Button icon={<Plus className="size-4" />} onClick={openNew}>Nueva solicitud</Button>} />
      <Card>
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<LifeBuoy className="size-6" />} title="Sin solicitudes" description="Tus solicitudes y las respuestas del equipo de OdontoSis aparecerán aquí." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} id={`req-${r.id}`} className={cx('space-y-2 px-5 py-4 transition-colors', (fresh.has(r.id) || highlight === r.id) && 'bg-brand-soft/50')}>
                <div className="flex flex-wrap items-center gap-2">
                  {(fresh.has(r.id) || highlight === r.id) && <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Respuesta nueva</span>}
                  <Badge color={r.type_color}>{r.type_name}</Badge>
                  <Badge color={r.status_color}>{r.status_name}</Badge>
                  <span className="text-xs text-muted">{formatDateTime(r.created_at, session.tenant?.timezone)}{r.created_by_name ? ` · ${r.created_by_name}` : ''}</span>
                </div>
                <p className="font-medium">{r.title}</p>
                <p className="whitespace-pre-wrap text-sm text-muted">{r.description}</p>
                <AttachmentThumbs files={r.attachments} />
                {r.response && (
                  <div className="rounded-control border border-line bg-surface-2 p-3 text-sm">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand"><MessageSquareReply className="size-3.5" /> Respuesta de OdontoSis</p>
                    <p className="whitespace-pre-wrap">{r.response}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title="Nueva solicitud"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} loading={saving} disabled={uploading}>{uploading ? 'Subiendo imágenes…' : 'Enviar'}</Button></>}>
        {form && (
          <div className="grid gap-4">
            <Select label="Tipo" value={form.typeCode} onChange={(e) => setForm({ ...form, typeCode: e.target.value })} options={TYPES} />
            <Input label="Título" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} error={errors.title} placeholder="Ej. Agregar campo de alergias al presupuesto" />
            <Textarea label="Detalle" required rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} error={errors.description}
              placeholder="Describe qué necesitas, en qué pantalla y, si es un error, los pasos para reproducirlo." />
            <ImageAttachments value={form.attachments} onChange={(attachments) => setForm((f) => (f ? { ...f, attachments } : f))} onBusyChange={setUploading} />
          </div>
        )}
      </Modal>
    </>
  );
}
