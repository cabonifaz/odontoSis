'use client';
import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

/** Muestra UNA vez la contraseña temporal generada por el servidor. */
export function TempPasswordModal({ data, onClose }: { data: { email: string; tempPassword: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open={!!data} onClose={() => { setCopied(false); onClose(); }} title="Contraseña temporal" size="sm"
      footer={<Button onClick={() => { setCopied(false); onClose(); }}>Entendido</Button>}>
      {data && (
        <div className="space-y-3 text-sm">
          <p>Comparte estas credenciales por un canal seguro. Se mostrarán <strong>solo esta vez</strong> y el usuario deberá cambiar la contraseña en su primer ingreso.</p>
          <div className="rounded-control border border-line bg-surface-2 p-3">
            <p className="text-muted">Usuario</p>
            <p className="font-medium">{data.email}</p>
            <p className="mt-2 text-muted">Contraseña temporal</p>
            <p className="flex items-center gap-2 font-mono text-base"><KeyRound className="size-4 text-brand" />{data.tempPassword}</p>
          </div>
          <Button variant="secondary" size="sm" icon={<Copy className="size-4" />} onClick={async () => { await navigator.clipboard.writeText(data.tempPassword); setCopied(true); }}>
            {copied ? 'Copiada' : 'Copiar contraseña'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
