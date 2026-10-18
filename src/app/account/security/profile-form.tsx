'use client';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { UserAvatar } from '@/components/avatar';
import { AvatarPicker } from '@/components/profile-quick';

/** Perfil propio: avatar, apodo y cumpleaños (para que el equipo te salude 🎉) */
export function ProfileForm({ initial }: { initial: { fullName: string; nickname: string | null; avatar: string | null; birthDate: string | null } }) {
  const toast = useToast();
  const [v, setV] = useState({ fullName: initial.fullName, nickname: initial.nickname ?? '', avatar: initial.avatar ?? '', birthDate: initial.birthDate?.slice(0, 10) ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api('/api/me/profile', { method: 'PUT', body: { ...v, birthDate: v.birthDate || null, nickname: v.nickname || null, avatar: v.avatar || null } });
      toast.success('Perfil actualizado.');
      window.location.reload();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'Error');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <UserAvatar avatar={v.avatar} name={v.fullName} size={64} />
        <div>
          <p className="text-lg font-semibold">{v.nickname || v.fullName}</p>
          {v.nickname && <p className="text-sm text-muted">{v.fullName}</p>}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Elige tu avatar</p>
        <AvatarPicker value={v.avatar} onChange={(avatar) => setV({ ...v, avatar })} />
        {v.avatar && <button type="button" className="mt-2 text-xs text-muted hover:text-fg" onClick={() => setV({ ...v, avatar: '' })}>Usar mis iniciales</button>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre completo" required value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} error={errors.fullName} />
        <Input label="Apodo" maxLength={40} placeholder="Ej. Dra. Sonrisas" value={v.nickname} onChange={(e) => setV({ ...v, nickname: e.target.value })} error={errors.nickname}
          hint="Así te saludará el sistema" />
        <Input label="Fecha de nacimiento" type="date" value={v.birthDate} onChange={(e) => setV({ ...v, birthDate: e.target.value })} error={errors.birthDate}
          hint="Para recordarle al equipo tu cumpleaños 🎂" />
      </div>
      <div className="flex justify-end"><Button onClick={save} loading={saving}>Guardar perfil</Button></div>
    </div>
  );
}
