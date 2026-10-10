import { RedemptionList } from '@/components/admin/RedemptionList';

export default function MerchandisePage() {
  return (
    <>
      <h1 className="adm-title">Merchandise</h1>
      <p className="adm-muted">Voiding frees that employee to collect again (for example after a wrong-size exchange). The reason is kept in the audit log.</p>
      <RedemptionList />
    </>
  );
}
