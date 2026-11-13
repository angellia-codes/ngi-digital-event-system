/**
 * Upload checks for videotron videos (spec 2026-11-13 §6, §9). Pure functions: the admin page reads the first bytes and
 * the <video> metadata of the chosen file and passes them in, so nothing here touches the DOM.
 */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const HEAD_BYTES = 8 * 1024 * 1024; // with +faststart the moov box, and so 'avc1', is near the start
const RATIO = 16 / 9;

export type VideoMeta = { bytes: number; width: number; height: number; duration: number };
export type VideoProblem = 'NOT_MP4' | 'NOT_H264' | 'TOO_BIG' | 'NOT_16_9' | 'NO_DURATION';

const ascii = (b: Uint8Array, at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

/** MP4 files start with a 'ftyp' box: 4 size bytes, then the type. */
export const isMp4 = (head: Uint8Array): boolean => head.length >= 8 && ascii(head, 4, 'ftyp');

/** An H.264 track has an 'avc1' sample entry in the moov box. Only the head is searched (exports need +faststart). */
export function hasAvc1(head: Uint8Array): boolean {
  for (let i = 0; i + 4 <= head.length; i++) if (head[i] === 0x61 && ascii(head, i, 'avc1')) return true;
  return false;
}

/** Every problem with the file, in the order they should be fixed. Empty means it may be uploaded. */
export function checkVideo(head: Uint8Array, meta: VideoMeta): VideoProblem[] {
  const out: VideoProblem[] = [];
  if (!isMp4(head)) out.push('NOT_MP4');
  else if (!hasAvc1(head)) out.push('NOT_H264');
  if (meta.bytes > MAX_VIDEO_BYTES) out.push('TOO_BIG');
  if (!(meta.width > 0 && meta.height > 0) || Math.abs(meta.width / meta.height - RATIO) / RATIO > 0.01) out.push('NOT_16_9');
  if (!(meta.duration > 0) || !Number.isFinite(meta.duration)) out.push('NO_DURATION');
  return out;
}

const PROBLEM_TEXT: Record<VideoProblem, string> = {
  NOT_MP4: 'Not an MP4 file.',
  NOT_H264: 'Not H.264, or exported without “fast start” (moov at the front). Re-export as H.264 MP4 with fast start.',
  TOO_BIG: 'Larger than 300 MB.',
  NOT_16_9: 'Not 16:9.',
  NO_DURATION: 'The browser could not read the length of this video.',
};

/** Admin wording, with the actual values where they help. */
export function describeVideoProblems(problems: VideoProblem[], meta: VideoMeta): string {
  return problems.map((p) => {
    if (p === 'TOO_BIG') return `Larger than 300 MB (${Math.round(meta.bytes / 1024 / 1024)} MB).`;
    if (p === 'NOT_16_9') return `Not 16:9 (${meta.width} × ${meta.height}).`;
    return PROBLEM_TEXT[p];
  }).join(' ');
}
