import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { buildInvitationsCsv, passUrl, waLink } from '@/lib/invitations';

const APP = 'https://nourishfest.example/';
const row = { employee_id: 'E1', full_name: 'Kadek Ayu', outlet: 'Outlet A', phone: '+6281234567001', invite_token: 'AAAAAAAAAAAAAAAAAAAAAA' };

describe('passUrl', () => {
  it('joins without a double slash', () => expect(passUrl(APP, 'T')).toBe('https://nourishfest.example/pass/T'));
});

describe('waLink', () => {
  it('uses digits only and an encoded Indonesian message with the link', () => {
    const link = waLink('+6281234567001', 'Kadek Ayu', 'https://x.test/pass/T');
    expect(link.startsWith('https://wa.me/6281234567001?text=')).toBe(true);
    const text = decodeURIComponent(link.split('text=')[1]);
    expect(text).toContain('Kadek');
    expect(text).toContain('https://x.test/pass/T');
    expect(text).toContain('NourishFest 2026');
  });
});

describe('buildInvitationsCsv', () => {
  const parse = (csv: string) => Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;

  it('writes one row per guest with the personal link', () => {
    const rows = parse(buildInvitationsCsv([row], APP));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employee_id: 'E1', full_name: 'Kadek Ayu', phone: '6281234567001', pass_link: `https://nourishfest.example/pass/${row.invite_token}` });
    expect(rows[0].whatsapp_link).toContain('https://wa.me/6281234567001');
  });
  it('leaves the WhatsApp link blank when there is no phone', () => {
    expect(parse(buildInvitationsCsv([{ ...row, phone: null }], APP))[0]).toMatchObject({ phone: '', whatsapp_link: '' });
  });
  it('neutralises spreadsheet formulas in names', () => {
    expect(parse(buildInvitationsCsv([{ ...row, full_name: '=HYPERLINK("http://evil")' }], APP))[0].full_name).toBe(`'=HYPERLINK("http://evil")`);
  });
  it('starts with a BOM so Excel reads UTF-8', () => {
    expect(buildInvitationsCsv([row], APP).charCodeAt(0)).toBe(0xfeff);
  });
});
