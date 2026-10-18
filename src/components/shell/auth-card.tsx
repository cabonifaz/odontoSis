import type { ReactNode } from 'react';

export type AuthBrand = { name: string; logoUrl: string | null; primary: string; secondary: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function AuthCard({ title, subtitle, children, brand }: { title: string; subtitle?: string; children: ReactNode; brand?: AuthBrand }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      {/* Colores de la clínica (validados como hex) cuando se ingresa desde su link */}
      {brand && HEX.test(brand.primary) && (
        <style>{`:root{--brand:${brand.primary};--accent:${HEX.test(brand.secondary) ? brand.secondary : brand.primary}}`}</style>
      )}
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center justify-center gap-2.5">
          {brand ? (
            <>
              {brand.logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={brand.logoUrl} alt="" className="h-16 w-auto max-w-56 object-contain" />
                : <div className="grid size-12 place-items-center rounded-xl bg-brand text-lg font-bold text-brand-contrast">{brand.name.slice(0, 2).toUpperCase()}</div>}
              <span className="text-center text-xl font-semibold tracking-tight">{brand.name}</span>
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 32 32" className="size-9" aria-hidden>
                <rect width="32" height="32" rx="8" fill="var(--brand)" />
                <path d="M10 9c-2 0-3.5 1.6-3.5 4 0 3 1.4 4.3 2 7.5.4 2.2.9 3.5 2 3.5 1.3 0 1.5-2 2.2-4 .4-1.1.8-1.6 1.3-1.6s.9.5 1.3 1.6c.7 2 .9 4 2.2 4 1.1 0 1.6-1.3 2-3.5.6-3.2 2-4.5 2-7.5 0-2.4-1.5-4-3.5-4-1.6 0-2.4.9-4 .9s-2.4-.9-4-.9z" fill="white" transform="translate(3 0)" />
              </svg>
              <span className="text-xl font-semibold tracking-tight">OdontoSis</span>
            </div>
          )}
        </div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {brand && <p className="mt-6 text-center text-xs text-subtle">Con la tecnología de OdontoSis</p>}
      </div>
    </main>
  );
}
