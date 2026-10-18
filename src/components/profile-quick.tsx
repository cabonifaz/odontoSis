'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Button, cx, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import type { ClientSession } from '@/lib/shared/types';
import { AVATAR_GROUPS, AVATARS, UserAvatar } from '@/components/avatar';

const NICK_IDEAS = ['Dra. Sonrisas', 'Dr. Muelitas', 'Hada de los dientes', 'Capitán Flúor', 'Reina del Hilo Dental', 'Doc Brackets', 'Señor Sarro Cero', 'La de la Agenda', 'Maestro del Blanqueamiento', 'Turbo Recepción'];

/** Selector de avatar agrupado por categorías */
export function AvatarPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="space-y-3" role="radiogroup" aria-label="Avatar">
      {AVATAR_GROUPS.map((g) => (
        <div key={g}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">{g}</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
            {AVATARS.filter((a) => a.group === g).map((a) => (
              <button key={a.key} type="button" role="radio" aria-checked={value === a.key} title={a.label} aria-label={a.label}
                onClick={() => onChange(a.key)}
                className={cx('grid aspect-square place-items-center rounded-full text-2xl transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  value === a.key && 'scale-110 ring-2 ring-brand ring-offset-2 ring-offset-surface')}
                style={{ backgroundColor: a.bg }}>
                {a.emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Personalización rápida (avatar + apodo) desde el menú o el aviso del inicio */
export function ProfileQuickModal({ open, onClose, session }: { open: boolean; onClose: () => void; session: ClientSession }) {
  const toast = useToast();
  const [avatar, setAvatar] = useState(session.avatar ?? '');
  const [nickname, setNickname] = useState(session.nickname ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api('/api/me/profile', {
        method: 'PUT',
        body: { fullName: session.fullName, nickname: nickname.trim() || null, avatar: avatar || null, birthDate: session.birthDate?.slice(0, 10) || null },
      });
      toast.success('¡Listo! Así te verá tu equipo.');
      window.location.reload();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'Error');
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Personaliza tu perfil" size="lg"
      footer={<>
        <Link href="/account/security" onClick={onClose} className="mr-auto self-center text-sm text-muted hover:text-fg">Más opciones (cumpleaños, contraseña)</Link>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} loading={saving}>Guardar</Button>
      </>}>
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-card bg-surface-2 p-4">
          <UserAvatar avatar={avatar} name={session.fullName} size={64} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{nickname.trim() || session.fullName.split(' ')[0]}</p>
            <p className="truncate text-sm text-muted">{session.fullName} · {session.roleName}</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Input label="Apodo" className="flex-1" maxLength={40} placeholder="Ej. Dra. Sonrisas" value={nickname}
            onChange={(e) => setNickname(e.target.value)} error={errors.nickname} hint="Así te saludará el sistema y te verá tu equipo" />
          <Button variant="secondary" aria-label="Sugerir apodo" title="Sugerir apodo" className="mb-6"
            onClick={() => setNickname(NICK_IDEAS.filter((n) => n !== nickname)[Math.floor(Math.random() * (NICK_IDEAS.length - 1))])}>
            <Shuffle className="size-4" />
          </Button>
        </div>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        {avatar && <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setAvatar('')}>Usar mis iniciales</button>}
      </div>
    </Modal>
  );
}
