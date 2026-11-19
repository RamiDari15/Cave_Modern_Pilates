import React, { useState } from 'react';

export function DeletionQueue({ api }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true); setError('');
    try { setRows((await api('/api/front-desk/deletion-requests')).requests || []); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function testEmail() {
    setBusy(true); setError('');
    try { const result = await api('/api/front-desk/deletion-email-test', {method:'POST',body:'{}'}); setError(result.message); }
    catch(e) { setError(e.message); } finally {setBusy(false);}
  }
  async function complete(event, row) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (!window.confirm('This sends the customer a deletion-completed email. Confirm that actual erasure and access revocation have already been completed.')) return;
    setBusy(true); setError('');
    try {
      await api('/api/front-desk/deletion-requests', { method: 'POST', body: JSON.stringify({ id: row.id,
        mindbodyDeleted: values.has('mindbodyDeleted'), caveDataDeleted: values.has('caveDataDeleted'),
        accessRevoked: values.has('accessRevoked'), billingReviewed: values.has('billingReviewed'),
        evidence: values.get('evidence'), retainedRecords: values.get('retainedRecords') }) });
      await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section style={{padding:24}}>
    <button type="button" onClick={() => { setOpen(!open); if (!open) refresh(); }}>Account deletion requests</button>
    {open && <div>
      <p>Complete each request within 48 hours. This queue records manual fulfillment; it does not erase Mindbody records. Check it daily, including requests whose email alert failed.</p>
      <button disabled={busy} onClick={refresh}>Refresh requests</button>
      <button disabled={busy} onClick={testEmail}>Send setup test to support inbox</button>
      {error && <p role="alert">{error}</p>}
      {!busy && !error && rows.length === 0 && <p>No open requests.</p>}
      {rows.map(row => <form key={row.id} onSubmit={event => complete(event, row)} style={{marginTop:24,padding:20,border:'1px solid currentColor',borderRadius:12}}>
        <h3>{row.email}</h3><p>Request {row.id} · Mindbody client {row.client_id || 'not linked'}</p>
        <p><strong>{new Date(row.due_at) < new Date() ? 'Overdue — ' : ''}Complete by {new Date(row.due_at).toLocaleString()}</strong></p>
        {!row.staff_notified_at && <p role="alert">Staff email alert not confirmed. Process this request now.</p>}
        {row.status === 'confirmation_pending' && <p>Completion email still needs to be retried. Verify the recorded evidence first.</p>}
        <p>Verify erasure in Mindbody, Cave databases and marketing providers. Remove non-required account data, saved links, profile caches, support data and marketing profiles. Revoke access and ensure background sync cannot restore deleted data. Retain only legally required records and document them below.</p>
        {[
          ['mindbodyDeleted','Mindbody confirmed actual Cave studio-profile erasure (not deactivation).'],
          ['caveDataDeleted','Cave-held personal data and marketing copies have been deleted, except documented legal records.'],
          ['accessRevoked','Old account sessions/access have been revoked and data cannot be restored by sync.'],
          ['billingReviewed','Memberships, recurring charges and bookings were reviewed and resolved.']
        ].map(([name,label]) => <label key={name} style={{display:'block',margin:'12px 0'}}><input name={name} type="checkbox" required /> {label}</label>)}
        <label style={{display:'block'}}>Completion evidence (provider reference, actions taken, operator and date; no unnecessary customer details)<textarea name="evidence" required minLength={20} maxLength={2000} defaultValue={row.evidence || ''} style={{display:'block',width:'100%',minHeight:90}} /></label>
        <label style={{display:'block'}}>Legally retained records and reason (included in confirmation; leave blank if none)<textarea name="retainedRecords" maxLength={2000} defaultValue={row.retained_records || ''} style={{display:'block',width:'100%'}} /></label>
        <button disabled={busy} type="submit">Confirm fulfillment and email customer</button>
      </form>)}
    </div>}
  </section>;
}
