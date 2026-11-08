import { RedemptionList } from '@/components/admin/RedemptionList';
import { StockPanel } from '@/components/admin/StockPanel';

export default function MerchandisePage() {
  return (
    <>
      <h1 className="adm-title">Merchandise</h1>
      <StockPanel />
      <h2 className="adm-sub">Hand-overs</h2>
      <p className="adm-muted">Voiding frees that employee to collect again (for example after a wrong-size exchange) and returns the size given to stock. The reason is kept in the audit log.</p>
      <RedemptionList />
    </>
  );
}
