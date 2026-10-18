'use client';
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------- Button ----------------
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};
const VARIANTS = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand-hover shadow-card',
  secondary: 'bg-surface text-fg border border-line hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:opacity-90',
};
const SIZES = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-base gap-2' };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex items-center justify-center rounded-control font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap',
        VARIANTS[variant], SIZES[size], className)} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ---------------- Field + controles ----------------
const control = 'w-full rounded-control border border-line bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-surface-2 disabled:text-muted aria-[invalid=true]:border-danger';

export function Field({ label, error, hint, required, children, className, htmlFor }: {
  label?: string; error?: string | null; hint?: string; required?: boolean; children: ReactNode; className?: string; htmlFor?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}{required && <span className="text-danger" aria-hidden> *</span>}
        </label>
      )}
      {children}
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string | null; hint?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, className, id, required, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={iid} className={className}>
      <input ref={ref} id={iid} required={required} aria-invalid={!!error || undefined} className={cx(control, 'h-10')} {...rest} />
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string | null; hint?: string; options: { value: string; label: string }[]; placeholder?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, options, placeholder, className, id, required, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} required={required} htmlFor={iid} className={className}>
      <select ref={ref} id={iid} required={required} aria-invalid={!!error || undefined} className={cx(control, 'h-10 pr-8')} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string | null; hint?: string };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, error, hint, className, id, ...rest }, ref) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid} className={className}>
      <textarea ref={ref} id={iid} aria-invalid={!!error || undefined} className={cx(control, 'py-2 min-h-20')} {...rest} />
    </Field>
  );
}
);

export function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------------- Card / Badge / layout ----------------
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-card border border-line bg-surface shadow-card', className)} {...rest}>{children}</div>;
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string | null; className?: string }) {
  const c = color ?? 'var(--text-muted)';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ color: c, backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)` }}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: c }} aria-hidden />
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-2 rounded-full bg-brand-soft p-3 text-brand">{icon}</div>}
      <p className="font-medium text-fg">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function Stat({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {icon && <div className="rounded-lg bg-brand-soft p-2 text-brand">{icon}</div>}
      </div>
    </Card>
  );
}

// ---------------- Modal (dialog nativo: foco atrapado + Esc) ----------------
export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <dialog ref={ref} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-card border border-line bg-surface p-0 text-fg shadow-modal backdrop:bg-black/40 backdrop:backdrop-blur-[2px]', widths[size])}>
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Cerrar"><X className="size-5" /></button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ---------------- Tabla ----------------
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('table-cards w-full text-sm', className)}>{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cx('border-b border-line bg-surface-2 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted', className)}>{children}</th>
);
export const Td = ({ children, className, label }: { children?: ReactNode; className?: string; label?: string }) => (
  <td data-label={label} className={cx('border-b border-line px-4 py-3 align-middle', className)}>{children}</td>
);

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.value ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-fg')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
