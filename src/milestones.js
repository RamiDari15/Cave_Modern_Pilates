// Class-count milestones celebrated at the front desk: 5, 10, 25, 50, 75, 100,
// then every 25 classes after that (125, 150, ...).
export const EARLY_MILESTONES = Object.freeze([5, 10, 25, 50, 75, 100]);
export const MILESTONE_STEP_AFTER_100 = 25;

export function isMilestone(count) {
  const n = Number(count);

  if (!Number.isInteger(n) || n <= 0) return false;
  if (n <= 100) return EARLY_MILESTONES.includes(n);
  return n % MILESTONE_STEP_AFTER_100 === 0;
}

export function nextMilestone(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const early = EARLY_MILESTONES.find((milestone) => milestone > n);

  if (early) return early;
  return (Math.floor(n / MILESTONE_STEP_AFTER_100) + 1) * MILESTONE_STEP_AFTER_100;
}

export function previousMilestone(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));

  if (n < EARLY_MILESTONES[0]) return 0;
  if (n <= 100) return [...EARLY_MILESTONES].reverse().find((milestone) => milestone <= n);
  return Math.floor(n / MILESTONE_STEP_AFTER_100) * MILESTONE_STEP_AFTER_100;
}

export function ordinal(count) {
  const n = Math.floor(Number(count) || 0);
  const mod100 = n % 100;

  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}
