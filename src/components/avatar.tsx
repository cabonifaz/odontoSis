import { cx } from '@/components/ui';

/** Avatares divertidos para el personal (sin imágenes externas: emoji sobre un color). Las claves no cambian: se guardan en BD. */
export type AvatarGroup = 'Sonrisas' | 'Animales' | 'Divertidos' | 'Comida';
export const AVATARS: { key: string; emoji: string; bg: string; label: string; group: AvatarGroup }[] = [
  { key: 'tooth', emoji: '🦷', bg: '#E0F2FE', label: 'Muela feliz', group: 'Sonrisas' },
  { key: 'brush', emoji: '🪥', bg: '#DCFCE7', label: 'Cepillo', group: 'Sonrisas' },
  { key: 'sparkle', emoji: '✨', bg: '#FEF9C3', label: 'Sonrisa brillante', group: 'Sonrisas' },
  { key: 'smile', emoji: '😁', bg: '#FFEDD5', label: 'Sonrisa', group: 'Sonrisas' },
  { key: 'grin', emoji: '😄', bg: '#FEF3C7', label: 'Carcajada', group: 'Sonrisas' },
  { key: 'wink', emoji: '😉', bg: '#FCE7F3', label: 'Guiño', group: 'Sonrisas' },
  { key: 'cool', emoji: '😎', bg: '#E0E7FF', label: 'Cool', group: 'Sonrisas' },
  { key: 'nerd', emoji: '🤓', bg: '#E2E8F0', label: 'Estudioso', group: 'Sonrisas' },
  { key: 'angel', emoji: '😇', bg: '#E0F2FE', label: 'Angelito', group: 'Sonrisas' },
  { key: 'party', emoji: '🥳', bg: '#EDE9FE', label: 'Fiesta', group: 'Sonrisas' },
  { key: 'fox', emoji: '🦊', bg: '#FFEDD5', label: 'Zorro', group: 'Animales' },
  { key: 'panda', emoji: '🐼', bg: '#F1F5F9', label: 'Panda', group: 'Animales' },
  { key: 'koala', emoji: '🐨', bg: '#E2E8F0', label: 'Koala', group: 'Animales' },
  { key: 'lion', emoji: '🦁', bg: '#FEF3C7', label: 'León', group: 'Animales' },
  { key: 'owl', emoji: '🦉', bg: '#F5F5F4', label: 'Búho', group: 'Animales' },
  { key: 'penguin', emoji: '🐧', bg: '#E0F2FE', label: 'Pingüino', group: 'Animales' },
  { key: 'octopus', emoji: '🐙', bg: '#FCE7F3', label: 'Pulpo', group: 'Animales' },
  { key: 'cat', emoji: '🐱', bg: '#FEF9C3', label: 'Gato', group: 'Animales' },
  { key: 'dog', emoji: '🐶', bg: '#FFEDD5', label: 'Perro', group: 'Animales' },
  { key: 'llama', emoji: '🦙', bg: '#F5F5F4', label: 'Llama', group: 'Animales' },
  { key: 'sloth', emoji: '🦥', bg: '#E7E5E4', label: 'Perezoso', group: 'Animales' },
  { key: 'turtle', emoji: '🐢', bg: '#DCFCE7', label: 'Tortuga', group: 'Animales' },
  { key: 'frog', emoji: '🐸', bg: '#DCFCE7', label: 'Rana', group: 'Animales' },
  { key: 'bee', emoji: '🐝', bg: '#FEF9C3', label: 'Abeja', group: 'Animales' },
  { key: 'dolphin', emoji: '🐬', bg: '#E0F2FE', label: 'Delfín', group: 'Animales' },
  { key: 'hamster', emoji: '🐹', bg: '#FFEDD5', label: 'Hámster', group: 'Animales' },
  { key: 'unicorn', emoji: '🦄', bg: '#FCE7F3', label: 'Unicornio', group: 'Divertidos' },
  { key: 'dino', emoji: '🦖', bg: '#DCFCE7', label: 'Dino', group: 'Divertidos' },
  { key: 'robot', emoji: '🤖', bg: '#E2E8F0', label: 'Robot', group: 'Divertidos' },
  { key: 'alien', emoji: '👽', bg: '#DCFCE7', label: 'Alien', group: 'Divertidos' },
  { key: 'rocket', emoji: '🚀', bg: '#EDE9FE', label: 'Cohete', group: 'Divertidos' },
  { key: 'star', emoji: '🌟', bg: '#FEF3C7', label: 'Estrella', group: 'Divertidos' },
  { key: 'ninja', emoji: '🥷', bg: '#E2E8F0', label: 'Ninja', group: 'Divertidos' },
  { key: 'superhero', emoji: '🦸', bg: '#FEE2E2', label: 'Superhéroe', group: 'Divertidos' },
  { key: 'wizard', emoji: '🧙', bg: '#EDE9FE', label: 'Mago', group: 'Divertidos' },
  { key: 'ghost', emoji: '👻', bg: '#F1F5F9', label: 'Fantasmita', group: 'Divertidos' },
  { key: 'crown', emoji: '👑', bg: '#FEF3C7', label: 'Corona', group: 'Divertidos' },
  { key: 'rainbow', emoji: '🌈', bg: '#E0F2FE', label: 'Arcoíris', group: 'Divertidos' },
  { key: 'avocado', emoji: '🥑', bg: '#DCFCE7', label: 'Palta', group: 'Comida' },
  { key: 'icecream', emoji: '🍦', bg: '#FCE7F3', label: 'Helado', group: 'Comida' },
  { key: 'donut', emoji: '🍩', bg: '#FFEDD5', label: 'Dona (con moderación)', group: 'Comida' },
  { key: 'apple', emoji: '🍎', bg: '#FEE2E2', label: 'Manzana', group: 'Comida' },
  { key: 'coffee', emoji: '☕', bg: '#F5F5F4', label: 'Cafecito', group: 'Comida' },
  { key: 'strawberry', emoji: '🍓', bg: '#FCE7F3', label: 'Fresa', group: 'Comida' },
];
export const AVATAR_GROUPS: AvatarGroup[] = ['Sonrisas', 'Animales', 'Divertidos', 'Comida'];

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
