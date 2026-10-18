'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';

export function LoginForm({ tenantCode }: { tenantCode?: string } = {}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/login', { body: { email: f.get('email'), password: f.get('password'), tenantCode } });
      // El servidor decide el destino (2FA, cambio de contraseña o inicio)
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input name="email" type="email" label="Correo electrónico" autoComplete="username" required autoFocus />
      <Input name="password" type="password" label="Contraseña" autoComplete="current-password" required />
      {error && <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>Ingresar</Button>
    </form>
  );
}
