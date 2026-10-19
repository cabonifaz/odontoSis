'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, ImageOff, ImagePlus, Loader2, X } from 'lucide-react';
import { cx, Modal } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';

export type Attachment = { id: string; name: string; mime?: string };
type Item = { key: string; name: string; preview: string; id?: string; error?: string };

const MAX_SIDE = 2400;          // px: suficiente para leer texto en capturas 4K o de celular
const KEEP_ORIGINAL = 1.5e6;    // bytes: por debajo, se sube tal cual si no hay que redimensionar
const fileUrl = (id: string) => `/api/files/${id}`;

/** Reduce capturas grandes (celular, pantallas 4K) antes de subir. Devuelve PNG/JPG/WEBP. */
async function shrink(file: File): Promise<Blob> {
  const okType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch {
    if (okType) return file;
    throw new Error('Formato de imagen no soportado. Usa PNG o JPG.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  if (okType && scale === 1 && file.size <= KEEP_ORIGINAL) { bmp.close(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const toBlob = (type: string, q?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  // WEBP mantiene nítido el texto con poco peso; si el navegador no lo genera, JPG
  let out = await toBlob('image/webp', 0.9);
  if (!out || out.type !== 'image/webp') out = await toBlob('image/jpeg', 0.88);
  if (!out) return file;
  return okType && out.size >= file.size ? file : out;
}

/**
 * Adjuntar capturas de pantalla: pegar (Ctrl+V tras Win+Shift+S / herramienta Recortes),
 * arrastrar y soltar, o elegir de la galería/cámara en celular o tablet.
 * Cada imagen se sube al momento; `onChange` recibe sólo las ya subidas.
 */
export function ImageAttachments({ value, onChange, max = 5, onBusyChange }: {
  value: Attachment[]; onChange: (v: Attachment[]) => void; max?: number; onBusyChange?: (busy: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const sync = useCallback((next: Item[]) => {
    setItems(next);
    onChange(next.filter((i) => i.id).map((i) => ({ id: i.id!, name: i.name })));
    onBusyChange?.(next.some((i) => !i.id && !i.error));
  }, [onChange, onBusyChange]);

  const update = useCallback((key: string, patch: Partial<Item>) => {
    sync(itemsRef.current.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }, [sync]);

  const add = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|heif)$/i.test(f.name));
    const room = max - itemsRef.current.filter((i) => !i.error).length;
    const batch = images.slice(0, Math.max(0, room)).map((f, n) => ({
      file: f,
      item: { key: crypto.randomUUID(), name: f.name && f.name !== 'image.png' ? f.name : `captura-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}${n ? `-${n}` : ''}.png`, preview: URL.createObjectURL(f) } as Item,
    }));
    if (!batch.length) return;
    sync([...itemsRef.current, ...batch.map((b) => b.item)]);
    await Promise.all(batch.map(async ({ file, item }) => {
      try {
        const blob = await shrink(file);
        const fd = new FormData();
        fd.append('kind', 'REQUEST_ATTACHMENT');
        fd.append('file', blob, item.name.replace(/\.(png|jpe?g|webp|heic|heif)$/i, '') + (blob.type === 'image/webp' ? '.webp' : blob.type === 'image/jpeg' ? '.jpg' : '.png'));
        const r = await api<{ id: string }>('/api/files', { form: fd });
        update(item.key, { id: r.id });
      } catch (e) {
        update(item.key, { error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'No se pudo subir.' });
      }
    }));
  }, [max, sync, update]);

  // Pegar desde el portapapeles en cualquier parte mientras el formulario está abierto
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      void add(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [add]);

  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);
  // Si el formulario se reinicia desde afuera (value vacío), limpiar
  useEffect(() => { if (value.length === 0 && itemsRef.current.some((i) => i.id)) sync([]); }, [value, sync]);

  const full = items.filter((i) => !i.error).length >= max;
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">Capturas de pantalla <span className="font-normal text-muted">(opcional, hasta {max})</span></p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void add(Array.from(e.dataTransfer.files)); }}
        className={cx('rounded-card border-2 border-dashed p-3 transition-colors', drag ? 'border-brand bg-brand-soft' : 'border-line')}>
        <div className="flex flex-wrap gap-3">
          {items.map((i) => (
            <figure key={i.key} className={cx('relative size-20 overflow-hidden rounded-control border bg-surface-2', i.error ? 'border-danger' : 'border-line')}>
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
              <img src={i.preview} alt={i.name} className={cx('size-full object-cover', (!i.id || i.error) && 'opacity-50')} />
              {!i.id && !i.error && <Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-brand" aria-label="Subiendo" />}
              <button type="button" onClick={() => { URL.revokeObjectURL(i.preview); sync(items.filter((x) => x.key !== i.key)); }}
                aria-label={`Quitar ${i.name}`} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                <X className="size-3.5" />
              </button>
              {i.error && <figcaption className="absolute inset-x-0 bottom-0 bg-danger px-1 py-0.5 text-[10px] leading-tight text-white" title={i.error}>No se subió</figcaption>}
            </figure>
          ))}
          {!full && (
            <button type="button" onClick={() => inputRef.current?.click()}
              className="grid size-20 place-items-center rounded-control border border-line bg-surface text-muted hover:border-brand hover:text-brand">
              <span className="flex flex-col items-center gap-1 text-[11px]"><ImagePlus className="size-5" />Agregar</span>
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          <span className="hidden sm:inline">Pega una captura con <kbd className="rounded border border-line px-1">Ctrl</kbd>+<kbd className="rounded border border-line px-1">V</kbd> (recórtala con <kbd className="rounded border border-line px-1">Win</kbd>+<kbd className="rounded border border-line px-1">Shift</kbd>+<kbd className="rounded border border-line px-1">S</kbd>), arrástrala aquí o pulsa Agregar.</span>
          <span className="sm:hidden">Pulsa Agregar para elegir un pantallazo de tu galería o tomar una foto.</span>
        </p>
        {items.find((i) => i.error) && <p className="mt-1 text-xs text-danger">{items.find((i) => i.error)!.error}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden
        onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </div>
  );
}

/** Miniaturas de capturas adjuntas con vista ampliada. */
export function AttachmentThumbs({ files, size = 64 }: { files: Attachment[] | null | undefined; size?: number }) {
  const [open, setOpen] = useState<Attachment | null>(null);
  // Capturas cuyo archivo no se pudo cargar (p. ej. el binario ya no está en el servidor)
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const markBroken = (id: string) => setBroken((b) => (b.has(id) ? b : new Set(b).add(id)));
  if (!files?.length) return null;
  return (
    <>
      <ul className="flex flex-wrap gap-2" aria-label="Capturas adjuntas">
        {files.map((f) => (
          <li key={f.id}>
            <button type="button" onClick={() => setOpen(f)} aria-label={`Ver captura ${f.name}`}
              className="block overflow-hidden rounded-control border border-line bg-surface-2 hover:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ width: size, height: size }}>
              {broken.has(f.id) ? (
                <span className="grid size-full place-items-center text-subtle" title="Imagen no disponible"><ImageOff className="size-5" aria-hidden /></span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la API
                <img src={fileUrl(f.id)} alt={f.name} loading="lazy" className="size-full object-cover" onError={() => markBroken(f.id)} />
              )}
            </button>
          </li>
        ))}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} size="xl"
        footer={open && (
          <a href={fileUrl(open.id)} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-control border border-line px-4 text-sm font-medium hover:bg-surface-2">
            <ExternalLink className="size-4" /> Abrir en tamaño real
          </a>
        )}>
        {open && (
          <div className="grid place-items-center">
            {broken.has(open.id) ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
                <ImageOff className="size-8" aria-hidden />
                <p className="font-medium text-fg">Imagen no disponible</p>
                <p>El archivo ya no está en el servidor. Pide a la clínica que vuelva a adjuntar la captura.</p>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la API
              <img src={fileUrl(open.id)} alt={open.name} className="max-h-[70dvh] w-auto object-contain" onError={() => markBroken(open.id)} />
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
