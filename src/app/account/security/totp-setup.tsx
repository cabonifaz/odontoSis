'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { api, ApiError } from '@/lib/client/api';
import { useToast } from '@/components/ui/toast';

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (enabled) {
    return (
      <div className="flex items-start gap-3 text-sm">
        <ShieldCheck className="size-6 text-success" />
        <p>La verificación en dos pasos está <strong>activa</strong>. Se te pedirá un código al iniciar sesión.</p>
      </div>
    );
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try { setSetup(await api('/api/auth/totp/setup', { body: { password } })); setPassword(''); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Error'); }
    finally { setLoading(false); }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/totp/confirm', { body: { code } });
      toast.success('Verificación en dos pasos activada.');
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
      setLoading(false);
    }
  }

  if (!setup) {
    return (
      <form onSubmit={start} className="space-y-4 text-sm">
        <p className="text-muted">Protege tu cuenta con un código temporal de Google Authenticator, Microsoft Authenticator u otra app compatible.</p>
        <Input type="password" label="Confirma tu contraseña" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={error} className="sm:max-w-xs" />
        <Button type="submit" loading={loading} disabled={!password}>Activar 2FA</Button>
      </form>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4 text-sm">
      <p>1. Escanea el código QR con tu app de autenticación.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="Código QR para 2FA" className="size-48 rounded-lg border border-line bg-white p-2" />
      <p className="text-muted">¿No puedes escanear? Ingresa esta clave: <code className="break-all rounded bg-surface-2 px-1.5 py-0.5">{setup.secret}</code></p>
      <p>2. Ingresa el código de 6 dígitos que muestra la app.</p>
      <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" label="Código" error={error} />
      <Button type="submit" loading={loading} disabled={code.length !== 6}>Confirmar y activar</Button>
    </form>
  );
}
