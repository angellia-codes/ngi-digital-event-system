import { ReportsPanel } from '@/components/admin/ReportsPanel';

export default function ReportsPage() {
  return (
    <>
      <h1 className="adm-title">Reports</h1>
      <p className="adm-muted">CSV files that open in Excel. Every download is written to the audit log. Download all of them on the evening of 9 December as a backup.</p>
      <ReportsPanel />
    </>
  );
}
