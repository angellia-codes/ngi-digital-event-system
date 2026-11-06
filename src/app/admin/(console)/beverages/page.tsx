import { BeverageList } from '@/components/admin/BeverageList';

export default function BeveragesPage() {
  return (
    <>
      <h1 className="adm-title">Beverages</h1>
      <p className="adm-muted">Voiding makes that employee’s drink QR work again (for example after a bar mistake). The reason is kept in the audit log. To change a drink before it is handed over, edit the guest on the Guests page.</p>
      <BeverageList />
    </>
  );
}
