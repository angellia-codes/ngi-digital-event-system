import { DrawHistory } from '@/components/admin/DrawHistory';

export default function DrawsPage() {
  return (
    <>
      <h1 className="adm-title">Draws</h1>
      <p className="adm-muted">Voiding reverses a draw (even a confirmed one), frees the slot for a redraw and returns the stage to idle if it is showing that draw. The winner stays eligible for other prizes. The reason is kept in the audit log.</p>
      <DrawHistory />
    </>
  );
}
