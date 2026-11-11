import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import FormPending from '@/components/FormPending';

// Self-hosted: no request to Google Fonts, so text renders on the first paint.
const montserrat = localFont({
  src: [
    { path: '../assets/fonts/montserrat-latin-500-normal.woff', weight: '400 600', style: 'normal' },
    { path: '../assets/fonts/montserrat-latin-700-normal.woff', weight: '700 800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-montserrat',
});

export const metadata: Metadata = { title: { default: 'GoXL Commerce', template: '%s · GoXL Commerce' }, description: 'Promote everywhere. Respond instantly. Convert intelligently. Deliver successfully.' };
export const viewport: Viewport = { themeColor: '#0F2A1E', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>{children}<FormPending /></body>
    </html>
  );
}
