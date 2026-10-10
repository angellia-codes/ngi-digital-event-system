'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from './client';

export type Me = { role: string; label: string; labels: string[] };

/** Loads the station session; sends the user to /station when it is missing or the role does not fit. */
export function useStation(required: string): { me: Me | null } {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let alive = true;
    api<Me>('/api/station/me').then((r) => {
      if (!alive) return;
      if (r.http === 401 || r.http === 403) return router.replace('/station');
      if (r.ok && r.data) {
        if (r.data.role !== required && r.data.role !== 'admin') return router.replace('/station');
        if (!r.data.label) return router.replace('/station'); // label not chosen yet
        setMe(r.data);
      }
    });
    return () => { alive = false; };
  }, [required, router]);
  return { me };
}
