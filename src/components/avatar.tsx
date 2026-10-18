import { cx } from '@/components/ui';

/** Avatares divertidos para el personal (sin imágenes externas: emoji sobre un color). */
export const AVATARS: { key: string; emoji: string; bg: string; label: string }[] = [
  { key: 'tooth', emoji: '🦷', bg: '#E0F2FE', label: 'Muela feliz' },
  { key: 'brush', emoji: '🪥', bg: '#DCFCE7', label: 'Cepillo' },
  { key: 'sparkle', emoji: '✨', bg: '#FEF9C3', label: 'Sonrisa brillante' },
  { key: 'smile', emoji: '😁', bg: '#FFEDD5', label: 'Sonrisa' },
  { key: 'cool', emoji: '😎', bg: '#E0E7FF', label: 'Cool' },
  { key: 'star', emoji: '🌟', bg: '#FEF3C7', label: 'Estrella' },
  { key: 'rocket', emoji: '🚀', bg: '#EDE9FE', label: 'Cohete' },
  { key: 'unicorn', emoji: '🦄', bg: '#FCE7F3', label: 'Unicornio' },
  { key: 'fox', emoji: '🦊', bg: '#FFEDD5', label: 'Zorro' },
  { key: 'panda', emoji: '🐼', bg: '#F1F5F9', label: 'Panda' },
  { key: 'koala', emoji: '🐨', bg: '#E2E8F0', label: 'Koala' },
  { key: 'lion', emoji: '🦁', bg: '#FEF3C7', label: 'León' },
  { key: 'owl', emoji: '🦉', bg: '#F5F5F4', label: 'Búho' },
  { key: 'penguin', emoji: '🐧', bg: '#E0F2FE', label: 'Pingüino' },
  { key: 'octopus', emoji: '🐙', bg: '#FCE7F3', label: 'Pulpo' },
  { key: 'dino', emoji: '🦖', bg: '#DCFCE7', label: 'Dino' },
  { key: 'cat', emoji: '🐱', bg: '#FEF9C3', label: 'Gato' },
  { key: 'dog', emoji: '🐶', bg: '#FFEDD5', label: 'Perro' },
  { key: 'robot', emoji: '🤖', bg: '#E2E8F0', label: 'Robot' },
  { key: 'alien', emoji: '👽', bg: '#DCFCE7', label: 'Alien' },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function UserAvatar({ avatar, name, size = 36, className }: { avatar?: string | null; name: string; size?: number; className?: string }) {
  const a = AVATARS.find((x) => x.key === avatar);
  return (
    <span aria-hidden className={cx('inline-grid shrink-0 select-none place-items-center rounded-full', !a && 'bg-brand-soft font-semibold text-brand', className)}
      style={{ width: size, height: size, fontSize: a ? size * 0.55 : size * 0.38, backgroundColor: a?.bg }}>
      {a ? a.emoji : initials(name)}
    </span>
  );
}

/** Nombre a mostrar: el apodo si existe */
export const displayName = (u: { nickname?: string | null; fullName: string }) => u.nickname?.trim() || u.fullName.split(' ')[0];
