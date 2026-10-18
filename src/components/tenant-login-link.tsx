'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';

/** Link de acceso (login) propio de una clínica: /c/<código>. */
export function TenantLoginLink({ code, compact }: { code: string; compact?: boolean }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/c/${code}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const body = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-sm">
        <Link2 className="size-4 shrink-0 text-brand" />
        <span className="truncate font-mono" title={url}>{url}</span>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />} onClick={copy}>{copied ? 'Copiado' : 'Copiar'}</Button>
        <a href={`/c/${code}`} target="_blank" rel="noopener noreferrer"><Button variant="secondary" size="sm" icon={<ExternalLink className="size-4" />}>Abrir</Button></a>
      </div>
    </div>
  );

  if (compact) return body;
  return (
    <Card className="mb-5 p-4">
      <p className="mb-2 text-sm font-medium">Link de acceso de la clínica</p>
      {body}
      <p className="mt-2 text-xs text-muted">Pantalla de ingreso con el logo y colores de la clínica. Sólo admite usuarios de esta clínica. Ábrelo en una ventana privada para probar sin cerrar tu sesión.</p>
    </Card>
  );
}
