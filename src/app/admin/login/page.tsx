import '@/styles/admin.css';

const MESSAGES: Record<string, string> = {
  forbidden: 'That Google account is not on the admin list. Ask HR to add it.',
  failed: 'Sign-in failed. Please try again.',
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="adm-login">
      <h1 className="adm-title">NourishFest admin</h1>
      <p className="adm-muted">Sign in with the Google account HR registered for this event.</p>
      {error && <p className="adm-msg adm-msg--error">{MESSAGES[error] ?? MESSAGES.failed}</p>}
      <a className="btn btn--gold" href="/auth/google">Sign in with Google</a>
    </main>
  );
}
