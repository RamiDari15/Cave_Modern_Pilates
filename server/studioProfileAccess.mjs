// Only a successfully fetched provider profile can establish revocation.
// Transport/authentication failures must never be labelled account deletion.
export function studioProfileAccess(payload, clientId, email) {
  const client = payload?.ClientCompleteInfo?.Client ?? payload?.Client;
  const explicitMissing = payload?.Client === null || payload?.ClientCompleteInfo?.Client === null;
  if (explicitMissing) return "revoked";
  if (!client || String(client.Id ?? client.ID ?? "") !== String(clientId)) return "unavailable";
  if (client.Active === false || client.Action === "Removed") return "revoked";
  // A studio contact email can legitimately differ from the OAuth email.
  // An explicitly blank email on an existing email-linked account requires
  // fresh studio registration; do not reuse that old profile identifier.
  if (Object.hasOwn(client, "Email") && email && !String(client.Email || "").trim()) return "revoked";
  return "active";
}
