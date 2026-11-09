import { RundownEditor } from '@/components/admin/RundownEditor';

export default function RundownPage() {
  return (
    <>
      <div className="adm-row">
        <h1 className="adm-title" style={{ margin: 0 }}>Rundown</h1>
        <span className="adm-spacer" />
        <a className="btn" href="/admin/cue-card">Print cue card</a>
      </div>
      <p className="adm-muted">The show order the MC runs with NEXT on the MC screen. Door-prize segments own their prizes: opening one takes the MC straight to the draw for those prizes.</p>
      <RundownEditor />
    </>
  );
}
