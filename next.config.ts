import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // En desarrollo el service worker se desactiva (se prueba con build de producción)
  disable: process.env.NODE_ENV !== 'production',
  cacheOnNavigation: true,
  reloadOnOnline: false,
  // Sólo íconos y manifiesto en el precache: las imágenes del manual (public/help) se bajan al abrir la ayuda
  globPublicPatterns: ['icons/**/*', 'manifest.webmanifest'],
});

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@node-rs/argon2', 'mysql2'],
  experimental: {
    serverActions: { bodySizeLimit: '3mb' },
    // El middleware (CSP) envuelve /api: sin esto recorta cuerpos a 10 MB y los archivos de paciente admiten 15 MB.
    // El tamaño real por ruta lo valida route() con Content-Length antes de leer el cuerpo.
    middlewareClientMaxBodySize: '16mb',
    // Mantiene en memoria las páginas visitadas: permite navegar entre ellas sin conexión
    staleTimes: { dynamic: 300, static: 600 },
  },
};

export default withSerwist(nextConfig);
