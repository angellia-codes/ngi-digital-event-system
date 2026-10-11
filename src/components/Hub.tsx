'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import type { StringKey } from '@/lib/i18n/strings';

type Card = { href: string; key: 'checkin' | 'merchandise' | 'draw' | 'prizes' | 'stage' | 'admin'; tint: string; icon: ReactNode };

const CARDS: Card[] = [
  { href: '/station/check-in', key: 'checkin', tint: '', icon: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="m9 12 2 2 4-4" /></> },
  { href: '/station/merchandise', key: 'merchandise', tint: 'pink', icon: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></> },
  { href: '/station/draw', key: 'draw', tint: 'green', icon: <><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></> },
  { href: '/station/prizes', key: 'prizes', tint: '', icon: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16M10 14.7V17c0 .6-.5 1-1.2 1.2C7.8 18.6 7 20.2 7 22M14 14.7V17c0 .6.5 1 1.2 1.2 1 .4 1.8 2 1.8 3.8" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></> },
  { href: '/stage', key: 'stage', tint: 'white', icon: <><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" /></> },
  { href: '/admin', key: 'admin', tint: 'pink', icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></> },
];

/** Launcher: one card per screen. Every screen still asks for its own PIN, key or admin login. */
export function Hub() {
  const { t } = useI18n();
  return (
    <>
      <h2 className="hub__title">{t('hub.title')}</h2>
      <nav className="hub__grid" aria-label={t('hub.title')}>
        {CARDS.map((c) => (
          <Link key={c.key} href={c.href} className={c.tint ? `hub__card hub__card--${c.tint}` : 'hub__card'}>
            <span className="hub__icon" aria-hidden="true"><svg viewBox="0 0 24 24">{c.icon}</svg></span>
            <span className="hub__name">{t(`hub.${c.key}` as StringKey)}</span>
            <span className="hub__sub">{t(`hub.${c.key}_sub` as StringKey)}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
