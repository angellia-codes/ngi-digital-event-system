import QRCode from 'qrcode';

export const QUIET_ZONE = 4;

/** One SVG path of 1×1 module runs, offset by the quiet zone. Error correction M, no logo. */
export function qrPath(payload: string, quiet: number = QUIET_ZONE): { size: number; modules: number; d: string } {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const data = qr.modules.data;
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (data[y * n + x]) {
        let run = 1;
        while (x + run < n && data[y * n + x + run]) run++;
        d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
        x += run;
      } else {
        x++;
      }
    }
  }
  return { size: n + quiet * 2, modules: n, d };
}
