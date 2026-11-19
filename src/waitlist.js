// Cave limits each class waitlist to five clients; honor smaller provider limits.
export function waitlistAvailability(count, providerLimit) {
  const configured = Number(providerLimit);
  const limit = Number.isFinite(configured) && configured > 0 ? Math.min(5, configured) : 5;
  const size = Math.max(0, Number(count) || 0);
  return { waitlistSize: size, maxWaitlistSize: limit, waitlistFull: size >= limit };
}
