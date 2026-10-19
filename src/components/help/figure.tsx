import { cx } from '@/components/ui';

/** Captura de pantalla del manual: se amplía al hacer clic (abre la imagen completa) */
export function Shot({ src, alt, caption, className, narrow }: { src: string; alt: string; caption?: React.ReactNode; className?: string; narrow?: boolean }) {
  return (
    <figure className={cx('my-5', narrow && 'mx-auto max-w-sm', className)}>
      <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-card border border-line bg-surface shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Ver en tamaño completo">
        {/* eslint-disable-next-line @next/next/no-img-element -- capturas estáticas del manual */}
        <img src={src} alt={alt} loading="lazy" className="w-full" />
      </a>
      {caption && <figcaption className="mt-2 text-sm text-muted">{caption}</figcaption>}
    </figure>
  );
}

/** Lista numerada que corresponde a los números naranjas de la captura */
export function Callouts({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="my-4 space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#EA580C] text-xs font-bold text-white">{i + 1}</span>
          <span className="text-sm leading-relaxed">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** Recuadro de consejo o advertencia */
export function Tip({ kind = 'tip', title, children }: { kind?: 'tip' | 'warn'; title: string; children: React.ReactNode }) {
  return (
    <div className={cx('my-5 rounded-card border p-4 text-sm', kind === 'tip' ? 'border-info/30 bg-info/10' : 'border-warning/40 bg-warning/10')}>
      <p className="mb-1 font-semibold">{kind === 'tip' ? '💡 ' : '⚠️ '}{title}</p>
      <div className="space-y-1 leading-relaxed text-muted">{children}</div>
    </div>
  );
}
