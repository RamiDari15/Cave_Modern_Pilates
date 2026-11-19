export function scheduleReleaseDate(classDate, member = false) {
  const match = String(classDate || '').match(/^(\d{4})-(\d{2})-/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 2, member ? 18 : 20));
  return date.toISOString().slice(0, 10);
}
export function isScheduleReleased(classDate, member, studioDate) {
  const release = scheduleReleaseDate(classDate, member);
  return Boolean(release && String(studioDate).slice(0, 10) >= release);
}
