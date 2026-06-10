import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import { themeInitScript } from '../lib/theme';
import { LanguageProvider } from '../lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title:       'JIKO CONNECT — Gesi yako, popote ulipo',
  description: 'JIKO CONNECT — order LPG cooking gas from nearby vendors, delivered by riders across Tanzania. Tafuta, agiza, pokea.',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'JIKO CONNECT' },
  icons:       { icon: '/icon-192.svg', apple: '/icon-192.svg' },
  openGraph:   { type: 'website', title: 'JIKO CONNECT', description: 'LPG gas delivery for Tanzania — households, suppliers, riders.', siteName: 'JIKO CONNECT' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 5, userScalable: true,
  viewportFit: 'cover', interactiveWidget: 'resizes-content', themeColor: '#F15A24',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossOrigin="" />
      </head>
      <body className="font-sans bg-sand text-ink antialiased">
        <LanguageProvider>{children}</LanguageProvider>
        <Toaster
          position="top-center"
          toastOptions={{ duration: 4000, style: { background: '#1A130E', color: '#FBF7F2', fontSize: '14px', borderRadius: '12px', padding: '12px 16px' } }}
        />
      </body>
    </html>
  );
}
