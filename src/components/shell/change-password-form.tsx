'use client';
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';
import { useToast } from '@/components/ui/toast';

const RULES: [string, (p: string) => boolean][] = [
  ['10 caracteres o más', (p) => p.length >= 10],
  ['Una mayúscula', (p) => /[A-Z]/.test(p)],
  ['Una minúscula', (p) => /[a-z]/.test(p)],
  ['Un número', (p) => /\d/.test(p)],
  ['Un símbolo', (p) => /[^A-Za-z0-9]/.test(p)],
];

export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const valid = RULES.every(([, t]) => t(pw)) && pw === confirm;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/password', { body: { currentPassword: new FormData(e.currentTarget).get('current'), newPassword: pw } });
      toast.success('Contraseña actualizada.');
      if (redirectTo) window.location.href = redirectTo;
      else { setPw(''); setConfirm(''); (e.target as HTMLFormElement).reset(); }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input name="current" type="password" label="Contraseña actual" autoComplete="current-password" required />
      <Input type="password" label="Nueva contraseña" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
      <ul className="grid grid-cols-2 gap-1 text-xs">
        {RULES.map(([label, t]) => (
          <li key={label} className={t(pw) ? 'flex items-center gap-1 text-success' : 'flex items-center gap-1 text-muted'}>
            {t(pw) ? <Check className="size-3.5" /> : <X className="size-3.5" />} {label}
          </li>
        ))}
      </ul>
      <Input type="password" label="Confirmar contraseña" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
        error={confirm && confirm !== pw ? 'No coincide' : null} required />
      {error && <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={!valid} loading={loading}>Guardar contraseña</Button>
    </form>
  );
}
