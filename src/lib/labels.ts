import { db } from './db';
import { env } from './env';

export async function stationLabels(): Promise<string[]> {
  const { data } = await db().from('events').select('config').eq('id', env().EVENT_ID).single();
  const labels = (data?.config as { station_labels?: unknown } | null)?.station_labels;
  return Array.isArray(labels) ? labels.filter((l): l is string => typeof l === 'string') : [];
}
