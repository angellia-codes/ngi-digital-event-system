import pg from 'pg';

export const EVENT = process.env.EVENT_ID;
// Supabase's session pooler caps clients at 15; the transaction pooler (6543) allows the 40 this script opens.
const url = (process.env.DATABASE_URL || '').replace(/(pooler.supabase.com):5432/, '$1:6543');
export const pool = new pg.Pool({ connectionString: url, max: 40, ssl: { rejectUnauthorized: false } });

export const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

export async function clean() {
  await q('delete from merchandise_redemptions where event_id = $1', [EVENT]);
  await q('delete from check_ins where event_id = $1', [EVENT]);
  await q('update events set next_prize_number = 1 where id = $1', [EVENT]);
}

export async function purge() {
  await clean();
  await q(`delete from guests where event_id = $1 and employee_id ~ '^(CA|CB|MA|MB)-'`, [EVENT]);
}

export async function makeGuests(n, prefix = 'CC') {
  await q(
    `insert into guests (event_id, employee_id, full_name, outlet)
     select $1::uuid, $2::text || '-' || g, 'Load Guest ' || g, 'Outlet ' || (g % 5)
       from generate_series(1, $3::int) g
     on conflict (event_id, employee_id) do nothing`,
    [EVENT, prefix, n],
  );
  return q(
    `select id, invite_token, merch_token from guests
      where event_id = $1 and employee_id like $2::text || '-%'
      order by length(employee_id), employee_id limit $3`,
    [EVENT, prefix, n],
  );
}
