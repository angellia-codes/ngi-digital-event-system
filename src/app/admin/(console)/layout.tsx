import { AdminNav } from '@/components/admin/AdminNav';
import { requireAdminPage } from '@/lib/admin-page';
import '@/styles/admin.css';
import '@/styles/admin-draw.css';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { email } = await requireAdminPage();
  return (
    <div className="adm">
      <AdminNav email={email} />
      {children}
    </div>
  );
}
