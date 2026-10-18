'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cake, Gift, MessageCircle, PartyPopper } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import { api } from '@/lib/client/api';
import { useApp } from '@/lib/client/app-context';
import { UserAvatar } from '@/components/avatar';

type P = { id: string; first_name: string; last_name: string; birth_date: string; record_number: string; phone: string | null; messaging: string | null; agreement_name: string | null; days_until: number; turning: number };
type S = { kind: 'USER' | 'DOCTOR'; id: string; name: string; nickname: string | null; avatar: string | null; birth_date: string; role_name: string; days_until: number };

const when = (d: number) => (d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`);
const dayLabel = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** WhatsApp con mensaje prellenado (número peruano de 9 dígitos => +51) */
function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '');
  const num = digits.length === 9 ? `51${digits}` : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

/** Cumpleaños de la semana: pacientes (oportunidad comercial) y equipo (saludo o presente). */
export function BirthdaysCard() {
  const { session } = useApp();
  const [data, setData] = useState<{ patients: P[]; staff: S[] } | null>(null);
  useEffect(() => { api<{ patients: P[]; staff: S[] }>('/api/birthdays').then(setData).catch(() => setData(null)); }, []);
  if (!data || (data.patients.length === 0 && data.staff.length === 0)) return null;
  const clinic = session.tenant?.name ?? 'tu clínica';

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {data.patients.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <Gift className="size-5 text-accent" />
            <h2 className="font-semibold">Cumpleaños de pacientes</h2>
            <span className="ml-auto text-xs text-muted">Ideal para una oferta o un control de regalo</span>
          </div>
          <ul className="divide-y divide-line">
            {data.patients.slice(0, 8).map((p) => {
              const contact = p.messaging || p.phone;
              const msg = `¡Feliz cumpleaños, ${p.first_name}! 🎉 En ${clinic} queremos celebrarlo contigo: este mes tienes un beneficio especial en tu próxima atención. ¡Te esperamos!`;
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Cake className="size-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/patients/${p.id}`} className="font-medium hover:text-brand">{p.first_name} {p.last_name}</Link>
                    <p className="text-xs text-muted">{dayLabel(p.birth_date)} · cumple {p.turning}{p.agreement_name ? ` · ${p.agreement_name}` : ''}</p>
                  </div>
                  <Badge color={p.days_until === 0 ? 'var(--accent)' : undefined}>{when(p.days_until)}</Badge>
                  {contact && (
                    <a href={waLink(contact, msg)} target="_blank" rel="noopener noreferrer" aria-label={`Enviar saludo y oferta a ${p.first_name}`}
                      className="rounded-full p-1.5 text-success hover:bg-success/10"><MessageCircle className="size-4" /></a>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {data.staff.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <PartyPopper className="size-5 text-brand" />
            <h2 className="font-semibold">Cumpleaños del equipo</h2>
            <span className="ml-auto text-xs text-muted">¡Un saludo o un detalle!</span>
          </div>
          <ul className="divide-y divide-line">
            {data.staff.map((s) => (
              <li key={`${s.kind}-${s.id}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                <UserAvatar avatar={s.avatar} name={s.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.nickname || s.name}</p>
                  <p className="text-xs text-muted">{s.role_name} · {dayLabel(s.birth_date)}</p>
                </div>
                <Badge color={s.days_until === 0 ? 'var(--brand)' : undefined}>{s.days_until === 0 ? '¡Hoy! 🎂' : when(s.days_until)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
