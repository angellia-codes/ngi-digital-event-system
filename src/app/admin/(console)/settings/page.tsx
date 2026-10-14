'use client';
import { EventDetails, type EventInfo } from '@/components/admin/EventDetails';
import { RehearsalPanel } from '@/components/admin/RehearsalPanel';
import { StagePanel } from '@/components/admin/StagePanel';
import { StationSettings, type PinRow } from '@/components/admin/StationSettings';
import { useLoad } from '@/lib/use-load';

type Settings = { event: { name: string } & EventInfo; mode: string; station_labels: string[]; pins: PinRow[] };

export default function SettingsPage() {
  const { data, loading, reload } = useLoad<Settings>('/api/admin/settings');
  if (loading) return <p className="adm-muted">Loading…</p>;
  if (!data) return <p className="adm-msg adm-msg--error">Could not load settings.</p>;
  return (
    <>
      <h1 className="adm-title">Settings</h1>
      <p className="adm-muted">{data.event.name} · {data.event.event_date}</p>
      <EventDetails key={JSON.stringify(data.event)} info={data.event} reload={reload} />
      <StationSettings key={data.station_labels.join('|')} pins={data.pins} labels={data.station_labels} reload={reload} />
      <StagePanel />
      <RehearsalPanel mode={data.mode} reload={reload} />
    </>
  );
}
