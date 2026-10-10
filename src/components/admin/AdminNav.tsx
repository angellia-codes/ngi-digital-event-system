'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/client';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/guests', label: 'Guests' },
  { href: '/admin/merchandise', label: 'Merchandise' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav({ email }: { email: string }) {
  const path = usePathname();
  async function signOut() {
    await api('/api/admin/logout', {});
    window.location.href = '/admin/login';
  }
  return (
    <nav className="adm-nav" aria-label="Admin">
      <span className="adm-nav__brand">NOURISHFEST</span>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>{l.label}</Link>
      ))}
      <span className="adm-nav__spacer" />
      <span className="adm-nav__who">{email}</span>
      <button className="btn" onClick={signOut}>Sign out</button>
    </nav>
  );
}
