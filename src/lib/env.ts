import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STATION_SESSION_SECRET: z.string().min(32),
  EVENT_ID: z.string().uuid(),
  APP_URL: z.string().url(),
});
export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= schema.parse(process.env));
}
