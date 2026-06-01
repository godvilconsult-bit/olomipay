import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import Sidebar from '../components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title:       'OlomiPay — Building Trust Through Blockchain',
  description: 'OlomiPay — Send money instantly via Mobile Money, chat with friends, earn interest. Building Trust Through Blockchain.',
  manifest:    '/manifest.json',
  appleWebApp: {
    capable:           true,
    statusBarStyle:    'default',
    title:             'OlomiPay',
  },
  icons: {
    icon:  '/icon-192.svg',
    apple: '/icon-192.svg',
  },
  openGraph: {
    type:        'website',
    title:       'OlomiPay',
    description: 'Mobile Money ↔ Stellar bridge for Tanzania',
    siteName:    'OlomiPay',
  },
};

export const viewport: Viewport = {
  width:              'device-width',
  initialScale:       1,
  maximumScale:       1,        // prevents zoom on input focus (iOS)
  userScalable:       false,
  themeColor:         '#1a56db',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 antialiased">
        <Sidebar />
        <div className="lg:ml-64">
          {children}
        </div>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e293b',
              color:      '#f1f5f9',
              fontSize:   '14px',
              borderRadius: '12px',
              padding:    '12px 16px',
            },
          }}
        />
      </body>
    </html>
  );
}
