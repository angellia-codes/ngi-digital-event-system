import { fail } from '@/lib/api';
import { rpc } from '@/lib/db';
import { env } from '@/lib/env';
import { buildReportCsv, isReportName, REPORTS } from '@/lib/reports';
import { actorId, adminGet } from '@/lib/routes';

export const GET = adminGet(async ({ actor, params }) => {
  const name = params.name ?? '';
  if (!isReportName(name)) return fail(400, 'BAD_INPUT');
  const r = await rpc<{ rows: Record<string, unknown>[] }>('report_rows', { p_event: env().EVENT_ID, p_report: REPORTS[name].sql });
  await rpc('audit', {
    p_event: env().EVENT_ID, p_actor_type: 'admin', p_actor: actorId(actor), p_action: 'report_exported',
    p_entity: 'report', p_entity_id: name, p_details: { rows: r.rows.length },
  });
  return new Response(buildReportCsv(name, r.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${REPORTS[name].file}"`,
      'Cache-Control': 'no-store',
    },
  });
});
