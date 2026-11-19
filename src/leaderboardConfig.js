// Cave class leaderboard: one point for every class a client takes. Dates are
// studio time (America/Chicago), both days included.
//
// Until the challenge starts the page shows a countdown. At midnight on
// startDate it switches to the live board on its own, everyone starting at
// zero, and only classes from startDate through endDate count.
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
