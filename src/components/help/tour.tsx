'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, CircleHelp, X } from 'lucide-react';
import { Button, cx } from '@/components/ui';

/**
 * Guía paso a paso sobre la pantalla real: oscurece todo menos el elemento del paso (marcado con
 * data-tour="<clave>") y muestra al lado una tarjeta con la explicación. Sin librerías externas
 * (respeta la CSP) y adaptable a celular (la tarjeta se ancla abajo).
 */
export type TourStep = {
  /** valor de data-tour del elemento a resaltar; sin target = tarjeta centrada (bienvenida/cierre) */
  target?: string;
  title: string;
  body: ReactNode;
};

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;

function findTarget(key?: string) {
  if (!key) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`));
  return all.find((el) => el.offsetParent !== null || el.getClientRects().length > 0) ?? null;
}

export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: (completed: boolean) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i];

  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setI(0); }, [open]);

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step?.target]);

  // Lleva el elemento a la vista y sigue su posición
  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(step?.target);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    measure();
    const t = window.setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, i, step?.target, measure]);

  const close = useCallback((completed: boolean) => onClose(completed), [onClose]);
  const next = useCallback(() => (i < steps.length - 1 ? setI(i + 1) : close(true)), [i, steps.length, close]);
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, prev, close]);

  useEffect(() => { if (open) cardRef.current?.focus(); }, [open, i]);

  if (!open || !mounted || !step) return null;

  // Posición de la tarjeta sin tapar el elemento: debajo, arriba, a la derecha o a la izquierda (lo que quepa);
  // si nada cabe (elemento muy grande), en la esquina inferior derecha. En celular, anclada abajo.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mobile = vw < 640;
  const cardW = Math.min(380, vw - 32);
  const cardH = cardRef.current?.offsetHeight ?? 260;
  const GAP = 14;
  const clampX = (x: number) => Math.min(Math.max(16, x), vw - cardW - 16);
  const clampY = (y: number) => Math.min(Math.max(16, y), vh - cardH - 16);
  let style: React.CSSProperties;
  if (!rect || mobile) {
    style = mobile ? { left: 16, right: 16, bottom: 16 } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: cardW };
  } else {
    const r = { ...rect, bottom: rect.top + rect.height, right: rect.left + rect.width };
    const options = [
      { ok: r.bottom + GAP + cardH <= vh - 8, top: r.bottom + GAP, left: clampX(r.left) },
      { ok: r.top - GAP - cardH >= 8, top: r.top - GAP - cardH, left: clampX(r.left) },
      { ok: r.right + GAP + cardW <= vw - 8, top: clampY(r.top), left: r.right + GAP },
      { ok: r.left - GAP - cardW >= 8, top: clampY(r.top), left: r.left - GAP - cardW },
    ];
    const pick = options.find((o) => o.ok) ?? { top: vh - cardH - 16, left: vw - cardW - 16 };
    style = { top: pick.top, left: pick.left, width: cardW };
  }

  return createPortal(
    <div className="no-print fixed inset-0 z-[100]" role="presentation">
      {/* Fondo oscuro con "ventana" sobre el elemento del paso */}
      {rect ? (
        <div aria-hidden className="pointer-events-none fixed rounded-xl ring-4 ring-brand transition-all duration-300"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px rgb(15 23 42 / 0.55)' }} />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-slate-900/55" />
      )}
      {/* Capa que evita clics accidentales fuera de la guía */}
      <div className="fixed inset-0" onClick={() => close(false)} />

      <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="fixed rounded-card border border-line bg-surface p-5 text-fg shadow-modal outline-none" style={style}>
        <div className="mb-2 flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Paso {i + 1} de {steps.length}</p>
          <button type="button" onClick={() => close(false)} aria-label="Cerrar guía" className="-m-1 rounded p-1 text-muted hover:bg-surface-2"><X className="size-4" /></button>
        </div>
        <h2 id="tour-title" className="text-base font-semibold">{step.title}</h2>
        <div id="tour-body" className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted">{step.body}</div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, k) => <span key={k} className={cx('h-1.5 rounded-full transition-all', k === i ? 'w-5 bg-brand' : 'w-1.5 bg-line-strong')} />)}
          </div>
          <div className="flex gap-2">
            {i > 0 && <Button size="sm" variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={prev}>Anterior</Button>}
            <Button size="sm" onClick={next} icon={i === steps.length - 1 ? <Check className="size-4" /> : undefined}>
              {i === steps.length - 1 ? 'Entendido' : <span className="inline-flex items-center gap-1">Siguiente <ArrowRight className="size-4" /></span>}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Guía con memoria: se abre sola la primera vez que el usuario entra a la pantalla
 * (una vez por usuario y guía) y se puede volver a abrir con el botón «¿Cómo se hace?».
 */
export function useTour(key: string, userId: string, autoStart = true) {
  const storageKey = `odx:tour:${key}:${userId}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!autoStart) return;
    let seen = true;
    // odx:tours=off desactiva el inicio automático (pruebas automáticas o equipos de capacitación)
    try { seen = localStorage.getItem(storageKey) === 'done' || localStorage.getItem('odx:tours') === 'off'; } catch { /* sin almacenamiento: no insistir */ }
    if (!seen) { const t = window.setTimeout(() => setOpen(true), 600); return () => window.clearTimeout(t); }
  }, [storageKey, autoStart]);
  const close = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(storageKey, 'done'); } catch { /* ignorar */ }
  }, [storageKey]);
  const start = useCallback(() => setOpen(true), []);
  return { open, start, close };
}

/** Botón para relanzar la guía de la pantalla */
export function HelpButton({ onClick, label = '¿Cómo se hace?' }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="ghost" icon={<CircleHelp className="size-4" />} onClick={onClick} data-tour-trigger>
      {label}
    </Button>
  );
}

/** Número de paso visible en la pantalla (①②③…) para seguir el orden sin abrir la guía */
export function StepBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span aria-hidden className={cx('inline-grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-[color:var(--brand-contrast,#fff)]', className)}>
      {n}
    </span>
  );
}
