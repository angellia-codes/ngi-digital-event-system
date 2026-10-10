import type { Metadata, Viewport } from 'next';
import { Anton, Archivo, Bungee, Oswald } from 'next/font/google';
import '@/styles/tokens.css';
import { I18nProvider } from '@/lib/i18n';

const bungee = Bungee({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-bungee' });
const anton = Anton({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-anton' });
const oswald = Oswald({ weight: ['400', '600'], subsets: ['latin'], display: 'swap', variable: '--font-oswald' });
const archivo = Archivo({ weight: ['400', '600'], subsets: ['latin'], display: 'swap', variable: '--font-archivo' });

export const metadata: Metadata = {
  title: 'NourishFest 2026',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0D0D0D' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${bungee.variable} ${anton.variable} ${oswald.variable} ${archivo.variable}`}>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
