'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
const Ctx = createContext<(kind: Toast['kind'], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, kind, message }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  const icons = { success: <CheckCircle2 className="size-5 text-success" />, error: <AlertTriangle className="size-5 text-danger" />, info: <Info className="size-5 text-info" /> };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-line bg-surface p-3 text-sm shadow-pop">
            {icons[t.kind]}
            <p className="flex-1">{t.message}</p>
            <button aria-label="Cerrar" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} className="text-muted"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = useContext(Ctx);
  return {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
  };
}
