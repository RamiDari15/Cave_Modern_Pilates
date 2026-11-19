import { googleMailConfig, sendGoogleDeletionMail } from './deletionMail.mjs';
import { createHmac, randomUUID } from 'node:crypto';

export const DELETION_HOURS = 48;
export const DELETION_STAFF_EMAIL = 'support@cavemodernpilates.com';
const fail = (status, message) => Object.assign(new Error(message), { status });

export function deletionIdentity(session, secret) {
  if (!session) throw fail(401, 'Please sign in first.');
  const email = String(session.user?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(409, 'Please sign in again so we can verify your account email.');
  if (!secret) throw fail(503, 'Account deletion is temporarily unavailable. Please try again later.');
  // Identity comes exclusively from the server-verified session, never the body.
  return { email, client_id: String(session.clientId || ''), subject_key: createHmac('sha256', secret).update(email).digest('hex') };
}

export function requestReceipt(row) {
  return { id: row.id, status: row.status, requestedAt: row.requested_at, dueAt: row.due_at,
    completedAt: row.completed_at || null, requestSubmitted: true, completionHours: DELETION_HOURS };
}

export async function submitDeletionRequest({ session, body, store, notify, secret, now = new Date() }) {
  const identity = deletionIdentity(session, secret);
  if (body?.confirmed !== true || body?.flow !== 'cave-deletion-v1') throw fail(400, 'Please confirm account deletion in the latest Cave app.');
  const existing = await store.findActive(identity.subject_key);
  const row = existing || await store.insert({ id: randomUUID(), ...identity, status: 'requested',
    requested_at: now.toISOString(), due_at: new Date(now.getTime() + DELETION_HOURS * 3600000).toISOString() });
  // Storage is authoritative. Failure to alert staff must not discard a request.
  // Retrying the same request retries the alert without moving the deadline.
  if (!row.staff_notified_at) {
    try { await notify(row, 'staff'); await store.patch(row.id, { staff_notified_at: new Date().toISOString() }); }
    catch { /* The protected staff queue also exposes requests awaiting alerts. */ }
  }
  return requestReceipt(row);
}

export async function completeDeletionRequest({ id, body, store, notify, now = new Date() }) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw fail(400, 'Invalid request.');
  const row = await store.get(id);
  if (!row) throw fail(404, 'Request not found.');
  if (row.status === 'completed') return requestReceipt(row);
  // This is a manual fulfillment record, NOT an API that erases Mindbody data.
  // Staff must supply evidence for both providers and Cave-held data first.
  if (body?.mindbodyDeleted !== true || body?.caveDataDeleted !== true || body?.accessRevoked !== true || body?.billingReviewed !== true ||
      String(body?.evidence || '').trim().length < 20) {
    throw fail(400, 'Verify Mindbody deletion, Cave data removal, access revocation and billing, then provide completion evidence. Deactivation is insufficient.');
  }
  // Store evidence before notification so a delivery outage is safely retryable.
  await store.patch(id, { status: 'confirmation_pending', erased_at: row.erased_at || now.toISOString(), evidence: String(body.evidence).trim().slice(0, 2000),
    retained_records: String(body.retainedRecords || '').trim().slice(0, 2000) });
  await notify({ ...row, retained_records: String(body.retainedRecords || '').trim() }, 'completion');
  const completed = { ...row, status: 'completed', completed_at: now.toISOString() };
  await store.patch(id, { status: completed.status, completed_at: completed.completed_at,
    // Remove direct identifiers once confirmation has been accepted for delivery.
    email: null, client_id: null });
  return requestReceipt(completed);
}

export function deletionServices(env = process.env, fetcher = fetch) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const base = /^https:\/\//.test(url) ? url : `https://${url}.supabase.co`;
  if (env.CAVE_DELETION_ENABLED !== 'true' || !url || !env.SUPABASE_SERVICE_ROLE_KEY || !(googleMailConfig(env) || (env.RESEND_API_KEY && env.DELETION_EMAIL_FROM)) || !env.SESSION_SECRET) {
    throw fail(503, 'Account deletion is temporarily unavailable. No new request has been submitted. Please try again later.');
  }
  async function db(method, query = {}, body) {
    const target = new URL(`${base}/rest/v1/account_deletion_requests`);
    for (const [k,v] of Object.entries(query)) target.searchParams.set(k, v);
    const response = await fetcher(target, { method, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fail(response.status === 409 ? 409 : 503, 'Deletion request storage is unavailable. Please try again.');
    return response.status === 204 ? [] : response.json();
  }
  const store = {
    findActive: async key => (await db('GET', { subject_key: `eq.${key}`, status: 'neq.completed', limit: '1' }))[0],
    get: async id => (await db('GET', { id: `eq.${id}`, limit: '1' }))[0],
    latestErasure: async key => (await db('GET', { subject_key: `eq.${key}`, erased_at: 'not.is.null', order: 'erased_at.desc', limit: '1' }))[0],
    latest: async key => (await db('GET', { subject_key: `eq.${key}`, order: 'requested_at.desc', limit: '1' }))[0],
    list: () => db('GET', { status: 'neq.completed', order: 'due_at.asc', limit: '200' }),
    patch: async (id, body) => (await db('PATCH', { id: `eq.${id}` }, body))[0],
    insert: async row => { try { return (await db('POST', {}, row))[0]; } catch (e) {
      if (e.status !== 409) throw e;
      const existing = await store.findActive(row.subject_key); if (!existing) throw e; return existing;
    } }
  };
  async function notify(row, type) {
    const staff = type === 'staff';
    const text = staff
      ? `Cave account deletion request ${row.id}\nAccount: ${row.email}\nMindbody client: ${row.client_id || 'not linked'}\nComplete by: ${row.due_at}\nOpen Cave's protected Front desk > Account deletion requests. Complete actual Mindbody erasure, Cave data removal, session/access revocation and billing review before recording completion. Deactivation alone is not deletion.`
      : `Your Cave account deletion has been completed.\nRequest: ${row.id}\n${row.retained_records ? `Records retained as legally required: ${row.retained_records}\n` : ''}Your separate universal Mindbody account and accounts at other studios are not part of this Cave account request.\nQuestions: ${DELETION_STAFF_EMAIL}`;
    if (googleMailConfig(env)) {
      return sendGoogleDeletionMail({ id: `${row.id}-${type}`, to: staff ? DELETION_STAFF_EMAIL : row.email,
        subject: staff ? 'Action required: Cave account deletion within 48 hours' : 'Your Cave account deletion is complete', text }, env);
    }
    const result = await fetcher('https://api.resend.com/emails', { method: 'POST', headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `cave-delete-${row.id}-${type}`
    }, body: JSON.stringify({ from: env.DELETION_EMAIL_FROM, to: [staff ? DELETION_STAFF_EMAIL : row.email], reply_to: DELETION_STAFF_EMAIL,
      subject: staff ? 'Action required: Cave account deletion within 48 hours' : 'Your Cave account deletion is complete', text }), signal: AbortSignal.timeout(15000) });
    if (!result.ok || !(await result.json()).id) throw fail(503, 'Confirmation email could not be sent. The request remains open for retry.');
  }
  return { store, notify, secret: env.SESSION_SECRET };
}

export function sessionPredatesErasure(session, row) {
  if (!row?.erased_at) return false;
  return !Number.isFinite(session?.iat) || session.iat * 1000 <= Date.parse(row.erased_at);
}
