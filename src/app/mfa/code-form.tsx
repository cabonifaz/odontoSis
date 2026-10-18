'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';
import { logout } from '@/components/shell/app-shell';

export function CodeForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/mfa', { body: { code: new FormData(e.currentTarget).get('code') } });
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
      setLoading(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input name="code" label="Código" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus error={error} />
      <Button type="submit" className="w-full" loading={loading}>Verificar</Button>
      <button type="button" onClick={() => logout()} className="w-full text-center text-sm text-muted hover:text-fg">Cancelar</button>
    </form>
  );
}
