import { AuditTable } from '@/components/admin/AuditTable';

export default function AuditPage() {
  return (
    <>
      <h1 className="adm-title">Audit log</h1>
      <p className="adm-muted">Newest first. Once the event is live, entries can no longer be deleted.</p>
      <AuditTable />
    </>
  );
}
