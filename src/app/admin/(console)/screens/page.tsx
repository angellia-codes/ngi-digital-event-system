import { ScreenManager } from '@/components/admin/ScreenManager';

export default function ScreensPage() {
  return (
    <>
      <div className="adm-row">
        <h1 className="adm-title" style={{ margin: 0 }}>Screens</h1>
        <span className="adm-spacer" />
        <a className="btn" href="/station/screen">Open Screen Control</a>
      </div>
      <p className="adm-muted">
        The videotron screens. Upload one 16:9 H.264 MP4 (1920 × 1080, fast start, up to 300 MB) per video screen. The stage laptop
        downloads every file and plays it from its own copy, so open /stage on it at least an hour before gates. The draw board takes over
        on its own when the MC picks a prize.
      </p>
      <ScreenManager />
    </>
  );
}
