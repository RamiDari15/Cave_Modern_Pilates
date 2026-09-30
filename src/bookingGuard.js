// Acquire synchronously, before React can render or an async operation can yield.
export function createBookingGuard() {
  let active = false;
  return {
    acquire() { if (active) return false; active = true; return true; },
    release() { active = false; }
  };
}

export function isCancelledVisit(visit) {
  const status = String(visit?.VisitStatus || visit?.BookingStatus || visit?.AppointmentStatus || visit?.Status || "");
  return visit?.IsCanceled === true || visit?.IsCancelled === true || visit?.LateCancelled === true || /cancel/i.test(status);
}

export function isActiveClassBooking(visit, classId) {
  const id = Number(visit?.ClassId || visit?.Class?.Id);
  const status = String(visit?.VisitStatus || visit?.BookingStatus || visit?.Status || "");
  const waitlisted = visit?.IsWaitlisted || visit?.OnWaitlist || visit?.Waitlist === true || visit?.WaitlistEntryId || visit?.WaitListEntryId || /wait\s*list/i.test(status);
  return id === Number(classId) && !isCancelledVisit(visit) && !waitlisted;
}
