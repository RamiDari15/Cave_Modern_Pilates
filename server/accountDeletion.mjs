// Mindbody's DELETE Consumer API only disconnects a partner. It is not
// account deletion. Use the provider's verified, business-specific data form.
export function accountDeletionDestination(env = process.env) {
  const value = String(env.MINDBODY_ACCOUNT_DELETION_URL || "").trim();
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!(host === "mindbodyonline.com" || host.endsWith(".mindbodyonline.com"))) return null;
  // Never distribute a customer's personalized email/preferences link.
  if ([...url.searchParams.keys()].some(key => /token|email|client|user|auth|signature|code/i.test(key))) return null;
  if (env.MINDBODY_ACCOUNT_DELETION_URL_VERIFIED !== "true") return null;
  return url.href;
}

export function deletionHandoff(env = process.env) {
  const url = accountDeletionDestination(env);
  if (!url) return { status: 503, body: { ok: false, code: "DELETION_NOT_CONFIGURED", message: "Account deletion is temporarily unavailable. No deletion request has been submitted. Please try again later." } };
  return { status: 200, body: { ok: true, data: { url, provider: "Mindbody", scope: "cave_studio_profile", requestSubmitted: false } } };
}

// Studio-profile deactivation, as requested by the owner after contacting
// Mindbody support. This operation does not certify erasure of stored data.
export async function deactivateStudioAccount({ session, confirmed, updateClient }) {
  if (!session) return { status: 401, body: { ok: false, message: "Please sign in first." } };
  if (confirmed !== true) return { status: 400, body: { ok: false, message: "Please confirm Cave account deactivation." } };
  const clientId = String(session.clientId || "").trim();
  if (!clientId || /^[a-f0-9-]{32,}$/i.test(clientId)) {
    return { status: 409, body: { ok: false, message: "No linked Cave studio profile was found." } };
  }
  const result = await updateClient({
    Client: { Id: clientId, Active: false },
    CrossRegionalUpdate: false,
    Test: false
  });
  if (result?.Client?.Active !== false) {
    return { status: 502, body: { ok: false, message: "Mindbody did not confirm deactivation. Please refresh your profile before trying again." } };
  }
  return { status: 200, body: { ok: true, data: { status: "deactivated", dataErased: false } } };
}
