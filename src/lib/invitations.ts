import Papa from 'papaparse';
import { csvSafe } from './csv';

export type InviteRow = {
  employee_id: string; full_name: string; nickname: string | null; outlet: string; phone: string | null; invite_token: string;
};

export const passUrl = (appUrl: string, token: string): string => `${appUrl.replace(/\/+$/, '')}/pass/${token}`;

/** Click-to-chat link with a ready English message; the admin only presses send. Greets by nickname, else first name. */
export function waLink(phone: string, name: string, url: string, nickname?: string | null): string {
  const greet = nickname?.trim() || (name.trim().split(/\s+/)[0] ?? name);
  const text = `Hi ${greet}, here's your personal invitation to NourishFest 2026. Open the link and save your QR code: ${url}`;
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function buildInvitationsCsv(rows: InviteRow[], appUrl: string): string {
  const data = rows.map((r) => {
    const link = passUrl(appUrl, r.invite_token);
    return {
      employee_id: csvSafe(r.employee_id),
      full_name: csvSafe(r.full_name),
      nickname: csvSafe(r.nickname ?? ''),
      outlet: csvSafe(r.outlet),
      phone: r.phone ? r.phone.replace(/\D/g, '') : '', // digits only: a leading "+" would be read as a formula
      pass_link: link,
      whatsapp_link: r.phone ? waLink(r.phone, r.full_name, link, r.nickname) : '',
    };
  });
  const columns = ['employee_id', 'full_name', 'nickname', 'outlet', 'phone', 'pass_link', 'whatsapp_link'] as const;
  // Object form with explicit fields, so an empty list still produces the header row.
  return '\uFEFF' + Papa.unparse({ fields: [...columns], data: data.map((d) => columns.map((c) => d[c])) });
}
