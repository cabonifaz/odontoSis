import 'server-only';
import { AppError } from './errors';

/**
 * Lee ancho/alto desde la cabecera de PNG, JPEG o WEBP sin decodificar la imagen.
 * Sirve para rechazar "bombas de descompresión": archivos pequeños que declaran dimensiones enormes
 * y congelan el navegador de quien los abre (p. ej. el super admin al atender una solicitud).
 */
export function imageSize(buf: Buffer, mime: string): { w: number; h: number } | null {
  try {
    if (mime === 'image/png' && buf.length >= 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (mime === 'image/webp' && buf.length >= 30) {
      const chunk = buf.subarray(12, 16).toString('ascii');
      if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
      if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        // SOF0..SOF15 salvo DHT(C4), JPG(C8) y DAC(CC)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch { /* cabecera truncada */ }
  return null;
}

const MAX_SIDE = 16_000;
const MAX_PIXELS = 80_000_000; // 80 MP: cubre radiografías y fotos de cámara profesionales

/** Lanza INVALID_FILE si una imagen declara dimensiones absurdas o ilegibles. Los PDF no se revisan aquí. */
export function assertSaneImage(buf: Buffer, mime: string) {
  if (!mime.startsWith('image/')) return;
  const s = imageSize(buf, mime);
  if (!s || s.w <= 0 || s.h <= 0 || s.w > MAX_SIDE || s.h > MAX_SIDE || s.w * s.h > MAX_PIXELS) {
    throw new AppError('INVALID_FILE', 400, 'La imagen tiene dimensiones no permitidas o está dañada.');
  }
}
