import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'OdontoSis', template: '%s · OdontoSis' },
  description: 'Gestión de clínicas odontológicas',
  manifest: '/manifest.webmanifest',
  applicationName: 'OdontoSis',
  appleWebApp: { capable: true, title: 'OdontoSis', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0e7490',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-full antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
