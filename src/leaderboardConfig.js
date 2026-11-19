// Cave class leaderboard: one point for every class a client takes between
// these dates (studio time, America/Chicago, both days included). Counting
// starts fresh on the start date; nothing before it carries over.
export const LEADERBOARD = {
  title: "Cave Class Challenge",
  startDate: "2026-12-06",
  endDate: "2026-12-20"
};

// "Amira Haddad" -> "Amira H." so the public board never shows full names.
export function leaderboardName(firstName, lastName) {
  const first = String(firstName || "").trim().split(/\s+/)[0] || "";
  const initial = String(lastName || "").trim().charAt(0).toUpperCase();
  if (!first) return initial ? `${initial}.` : "Cave client";
  const prettyFirst = first.charAt(0).toUpperCase() + first.slice(1);
  return initial ? `${prettyFirst} ${initial}.` : prettyFirst;
}
