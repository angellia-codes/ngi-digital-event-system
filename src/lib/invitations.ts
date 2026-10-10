import Papa from 'papaparse';
import { csvSafe } from './csv';

export type InviteRow = { employee_id: string; full_name: string; outlet: string; phone: string | null; invite_token: string };

export const passUrl = (appUrl: string, token: string): string => `${appUrl.replace(/\/+$/, '')}/pass/${token}`;

/** Click-to-chat link with a ready Indonesian message; the admin only presses send. */
export function waLink(phone: string, name: string, url: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const text = `Halo ${first}, ini undangan pribadimu untuk NourishFest 2026. Buka linknya dan simpan QR-nya ya: ${url}`;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function buildInvitationsCsv(rows: InviteRow[], appUrl: string): string {
  const data = rows.map((r) => {
    const link = passUrl(appUrl, r.invite_token);
    return {
      employee_id: csvSafe(r.employee_id),
      full_name: csvSafe(r.full_name),
      outlet: csvSafe(r.outlet),
      phone: r.phone ? r.phone.replace(/\D/g, '') : '', // digits only: a leading "+" would be read as a formula
      pass_link: link,
      whatsapp_link: r.phone ? waLink(r.phone, r.full_name, link) : '',
    };
  });
  const columns = ['employee_id', 'full_name', 'outlet', 'phone', 'pass_link', 'whatsapp_link'] as const;
  // Object form with explicit fields, so an empty list still produces the header row.
  return '\uFEFF' + Papa.unparse({ fields: [...columns], data: data.map((d) => columns.map((c) => d[c])) });
}
