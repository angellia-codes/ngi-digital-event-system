import { Hub } from '@/components/Hub';
import { Wordmark } from '@/components/Wordmark';
import '@/styles/hub.css';
import '@/styles/pass.css';

export default function Home() {
  return (
    <div className="pass-bg">
      <main className="hub">
        <Wordmark />
        <p className="sticker">MOVE IN UNITY.</p>
        <p className="hub__tagline">Together, We Make a Difference</p>
        <Hub />
      </main>
    </div>
  );
}
