import { db } from './db';
import { MAX_VIDEO_BYTES } from './mp4-check';

/**
 * Videotron videos live in a private Storage bucket. Browsers never get a key for it: the admin page gets a signed
 * upload URL, the stage laptop gets signed download URLs. Server-only.
 */
export const BUCKET = 'screens';
const DOWNLOAD_TTL_S = 6 * 3600; // the stage re-fetches the manifest every 60 s, so a long TTL is only for slow downloads

let bucketReady = false;

/** Creates the bucket on first use (private, MP4 only, 300 MB per file). */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const storage = db().storage;
  const { data } = await storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_VIDEO_BYTES, allowedMimeTypes: ['video/mp4'] });
    if (error && !/already exists/i.test(error.message)) throw new Error('bucket_create_failed');
  }
  bucketReady = true;
}

/** path → signed download URL. A path that cannot be signed is left out (the stage shows it as failed). */
export async function signedDownloads(paths: string[], download?: (path: string) => string): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const out: Record<string, string> = {};
  if (download) {
    // Signed URLs with a file name, for the admin "USB fallback" list.
    await Promise.all(paths.map(async (p) => {
      const { data } = await db().storage.from(BUCKET).createSignedUrl(p, DOWNLOAD_TTL_S, { download: download(p) });
      if (data?.signedUrl) out[p] = data.signedUrl;
    }));
    return out;
  }
  const { data, error } = await db().storage.from(BUCKET).createSignedUrls(paths, DOWNLOAD_TTL_S);
  if (error) throw new Error('sign_failed');
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** A one-time upload URL for exactly this path (valid 2 hours). */
export async function signedUpload(path: string): Promise<string> {
  await ensureBucket();
  const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error('sign_upload_failed');
  return data.signedUrl;
}
