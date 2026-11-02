import type { Booking, BookingDay } from "@/api/types";

// "HH:MM" or "HH:MM:SS" to minutes since midnight, or null when invalid.
export function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function fmtMinutes(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmm(t: string | null | undefined): string {
  const mins = toMinutes(t);
  return mins == null ? "" : fmtMinutes(mins);
}

// Length of a day's window in minutes, counting end_next_day. Null when the
// day has no start or end time.
export function dayDurationMinutes(
  d: Pick<BookingDay, "start_time" | "end_time" | "end_next_day">
): number | null {
  const s = toMinutes(d.start_time);
  const e = toMinutes(d.end_time);
  if (s == null || e == null) return null;
  const end = d.end_next_day || e < s ? e + 1440 : e;
  return end - s;
}

export const SPLIT_MIN_MINUTES = 8 * 60;

// Split is offered on full_day rows longer than 8 hours.
export function canSplitDay(d: BookingDay): boolean {
  const dur = dayDurationMinutes(d);
  return d.day_type === "full_day" && dur != null && dur > SPLIT_MIN_MINUTES;
}

// Middle of the window rounded to 30 minutes, as HH:MM. Wraps past midnight
// for overnight days. Always strictly inside the window when the window is
// longer than 30 minutes.
export function defaultSplitTime(
  d: Pick<BookingDay, "start_time" | "end_time" | "end_next_day">
): string {
  const s = toMinutes(d.start_time);
  const dur = dayDurationMinutes(d);
  if (s == null || dur == null) return "";
  let mid = Math.round((s + dur / 2) / 30) * 30;
  if (mid <= s) mid = s + 30;
  if (mid >= s + dur) mid = s + dur - 30;
  return fmtMinutes(mid);
}

export interface DriverRef {
  id: number;
  full_name: string;
}

// Day's own driver override, else the booking driver, else null. Tolerates an
// older backend that omits driver / effective_driver.
export function effectiveDriver(
  day: BookingDay,
  booking: Pick<Booking, "driver">
): DriverRef | null {
  if (day.effective_driver) return day.effective_driver;
  if (day.driver != null && day.driver_name) {
    return { id: day.driver, full_name: day.driver_name };
  }
  if (booking.driver) {
    return { id: booking.driver.id, full_name: booking.driver.full_name };
  }
  return null;
}

// Distinct effective drivers across the booking's days, in day order.
export function distinctDrivers(booking: Booking): DriverRef[] {
  const seen = new Map<number, DriverRef>();
  for (const d of booking.days ?? []) {
    const e = effectiveDriver(d, booking);
    if (e && !seen.has(e.id)) seen.set(e.id, e);
  }
  return [...seen.values()];
}

export function sortDays(days: BookingDay[]): BookingDay[] {
  return [...days].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (toMinutes(a.start_time) ?? -1) - (toMinutes(b.start_time) ?? -1) ||
      a.id - b.id
  );
}

// Shift index (0 = first, 1 = second, ...) of each day id: days sharing a
// date are shifts ordered by start time. A lone day is shift 0.
export function shiftIndexByDayId(days: BookingDay[]): Map<number, number> {
  const out = new Map<number, number>();
  const byDate = new Map<string, BookingDay[]>();
  for (const d of sortDays(days)) {
    byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);
  }
  byDate.forEach((list) => list.forEach((d, i) => out.set(d.id, i)));
  return out;
}

// The second shift of a date: the row to remove, plus the first row it
// merges back into. Null when `day` is not the later row of a split date.
export function splitPartner(
  day: BookingDay,
  days: BookingDay[]
): BookingDay | null {
  const same = sortDays(days.filter((d) => d.date === day.date));
  if (same.length < 2 || same[0].id === day.id) return null;
  const idx = same.findIndex((d) => d.id === day.id);
  return idx > 0 ? same[idx - 1] : null;
}

// Patch for the first row after its second shift is deleted: it takes over
// the removed row's end. A removed row on the next date (post-midnight split)
// leaves the first row overnight.
export function mergeBackPatch(
  first: BookingDay,
  removed: BookingDay
): { end_time: string | null; end_next_day: boolean } {
  const sameDate = removed.date === first.date;
  return {
    end_time: removed.end_time,
    end_next_day: sameDate ? !!removed.end_next_day : true,
  };
}

// Only the days a given driver drives (for their own trip message).
export function driverDays(booking: Booking, driverId: number): BookingDay[] {
  return sortDays(
    (booking.days ?? []).filter(
      (d) => effectiveDriver(d, booking)?.id === driverId
    )
  );
}
