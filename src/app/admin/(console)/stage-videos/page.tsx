import { StageVideos } from '@/components/admin/StageVideos';

export default function StageVideosPage() {
  return (
    <>
      <h1 className="adm-title">Stage videos</h1>
      <p className="adm-muted">Put a background loop on the stage display. It repeats until you tap Stop or the MC shows a prize. The loops are silent; the stage laptop keeps its own copy, so they keep playing if the internet drops.</p>
      <StageVideos />
    </>
  );
}
