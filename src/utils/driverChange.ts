import type {
  Booking,
  BookingDay,
  CreateBookingDayPayload,
} from "@/api/types";

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

export function toApiTime(t: string): string | null {
  const mins = toMinutes(t);
  if (mins == null) return null;
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}:00`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface SplitResult {
  // Updated end for the original day.
  firstEnd: string;
  firstEndNextDay: boolean;
  // The new (second) shift for this day.
  secondDate: string;
  secondStart: string;
  secondEnd: string;
  secondEndNextDay: boolean;
}

// Splits one day at `change` (HH:MM). Returns an error string when the
// change time is not inside the original window.
//   - Same-day window (end_next_day false): start < change < end.
//   - Overnight window (end_next_day true): either change > start (evening,
//     same date) or 00:00 < change < end (after midnight, so the second
//     shift belongs to the NEXT date).
export function splitDay(
  day: BookingDay,
  change: string
): SplitResult | string {
  const start = toMinutes(day.start_time);
  const end = toMinutes(day.end_time);
  const c = toMinutes(change);
  if (start == null || end == null) {
    return `${day.date} has no start or end time, so it cannot be split.`;
  }
  if (c == null) return "Enter the change time as HH:MM.";
  const overnight = !!day.end_next_day;
  const endStr = day.end_time as string;
  if (!overnight) {
    if (c <= start || c >= end) {
      return `${day.date}: change time must be after the start and before the end of the shift.`;
    }
    return {
      firstEnd: change,
      firstEndNextDay: false,
      secondDate: day.date,
      secondStart: change,
      secondEnd: endStr,
      secondEndNextDay: false,
    };
  }
  if (c > start) {
    return {
      firstEnd: change,
      firstEndNextDay: false,
      secondDate: day.date,
      secondStart: change,
      secondEnd: endStr,
      secondEndNextDay: true,
    };
  }
  if (c > 0 && c < end) {
    return {
      firstEnd: change,
      firstEndNextDay: true,
      secondDate: addDays(day.date, 1),
      secondStart: change,
      secondEnd: endStr,
      secondEndNextDay: false,
    };
  }
  return `${day.date}: change time must fall inside the shift (after the start, or after midnight and before the end).`;
}

// Existing day row back into the write shape, so a PATCH of `days` keeps
// every other field as it was.
export function dayToPayload(d: BookingDay): CreateBookingDayPayload {
  return {
    date: d.date,
    day_type: d.day_type,
    start_time: d.start_time,
    end_time: d.end_time,
    end_next_day: !!d.end_next_day,
    notes: d.notes,
    client_rate: d.client_rate ?? "0.00",
    driver_rate: d.driver_rate,
    driver_payment_status: d.driver_payment_status,
  };
}

export function bookingCanSplit(b: Booking): boolean {
  return (
    !!b.car &&
    (b.days ?? []).some(
      (d) => toMinutes(d.start_time) != null && toMinutes(d.end_time) != null
    )
  );
}
