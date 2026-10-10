import { PrizeManager } from '@/components/admin/PrizeManager';

export default function PrizesPage() {
  return (
    <>
      <h1 className="adm-title">Prizes</h1>
      <p className="adm-muted">The list the MC draws from. After a prize has been drawn, its batch setting is locked and its quantity can only grow (or shrink down to the highest slot in play).</p>
      <PrizeManager />
    </>
  );
}
