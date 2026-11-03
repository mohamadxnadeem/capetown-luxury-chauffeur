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

// Dates carrying 2+ rows on one booking (split days).
export function splitDateSet(days: BookingDay[]): Set<string> {
  const count = new Map<string, number>();
  for (const d of days) count.set(d.date, (count.get(d.date) ?? 0) + 1);
  const out = new Set<string>();
  count.forEach((n, date) => {
    if (n > 1) out.add(date);
  });
  return out;
}

export function uniqueSortedDates(days: BookingDay[]): string[] {
  return [...new Set(days.map((d) => d.date))].sort();
}

// Whole-day window of the first date: first shift's start to last shift's
// end. A split day is two rows on one date, so "first row" alone would only
// give shift 1. Used to prefill "add another vehicle".
export function firstDateWindow(days: BookingDay[]): {
  start: string | null;
  end: string | null;
} {
  const sorted = sortDays(days);
  if (sorted.length === 0) return { start: null, end: null };
  const same = sorted.filter((d) => d.date === sorted[0].date);
  return {
    start: same[0].start_time ?? null,
    end: same[same.length - 1].end_time ?? null,
  };
}

// A stored day row back into the write shape, untouched. `driver` is only
// included when the backend returned it (older backends omit it).
export function dayRowToPayload(d: BookingDay): CreateBookingDayPayload {
  const p: CreateBookingDayPayload = {
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
  if (d.driver !== undefined) p.driver = d.driver;
  return p;
}

// Days array for an edit save. Split dates (2+ stored rows) are carried
// through untouched, one entry per row. Other dates use the form's values
// (`buildNormal`) and keep the day's own driver. The backend rewrites every
// day row on save, so dropping a row here would delete a shift.
export function buildEditDays(
  original: BookingDay[],
  selectedDates: string[],
  buildNormal: (date: string) => CreateBookingDayPayload
): CreateBookingDayPayload[] {
  const split = splitDateSet(original);
  const out: CreateBookingDayPayload[] = [];
  for (const date of [...new Set(selectedDates)].sort()) {
    if (split.has(date)) {
      out.push(
        ...sortDays(original.filter((d) => d.date === date)).map(dayRowToPayload)
      );
      continue;
    }
    const row = buildNormal(date);
    const orig = original.find((d) => d.date === date);
    if (orig && orig.driver !== undefined && row.driver === undefined) {
      row.driver = orig.driver;
    }
    out.push(row);
  }
  return out;
}

// ---- One card per booking (or same-car group) per date -------------------

export interface DayCardEntry {
  booking: Booking;
  day: BookingDay;
}

export interface DayCard {
  key: string;
  // Rows on this date, ordered by start time. Empty for a tail card (an
  // overnight shift from the previous date still running this morning).
  entries: DayCardEntry[];
  bookings: Booking[];
  // Set when the card merges bookings of one booking group.
  groupId: number | null;
  // Where a tap should go: the group screen when there is a group, else the
  // first booking.
  firstBooking: Booking;
}

function prevIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Cards for one date. A booking with 2+ rows that date is ONE card. Separate
// bookings that are the same car in the same booking group merge into one
// card too. A booking showing only because of the previous date's overnight
// tail (no row on this date) is its own card with no entries.
export function dayCardsForDate(bookings: Booking[], date: string): DayCard[] {
  const prev = prevIso(date);
  const byKey = new Map<string, DayCard>();
  const order: DayCard[] = [];
  const add = (b: Booking, day: BookingDay | null) => {
    const carId = b.car?.id ?? null;
    const merge = b.group_id != null && carId != null;
    const key = merge
      ? `g${b.group_id}-c${carId}-${date}`
      : `b${b.id}-${date}`;
    let card = byKey.get(key);
    if (!card) {
      card = {
        key,
        entries: [],
        bookings: [],
        groupId: merge ? (b.group_id as number) : null,
        firstBooking: b,
      };
      byKey.set(key, card);
      order.push(card);
    }
    if (!card.bookings.some((x) => x.id === b.id)) card.bookings.push(b);
    if (day) card.entries.push({ booking: b, day });
  };
  for (const b of bookings) {
    const days = b.days ?? [];
    const rows = days.filter((d) => d.date === date);
    if (rows.length > 0) {
      for (const r of rows) add(b, r);
    } else if (days.some((d) => d.date === prev && d.end_next_day)) {
      add(b, null);
    }
  }
  for (const card of order) {
    card.entries.sort(
      (a, b) =>
        (toMinutes(a.day.start_time) ?? -1) -
          (toMinutes(b.day.start_time) ?? -1) || a.day.id - b.day.id
    );
    card.bookings.sort((a, b) => a.id - b.id);
    card.firstBooking = card.entries[0]?.booking ?? card.bookings[0];
  }
  return order;
}

// Whole window of a card's rows: first start to last end. endNextDay when the
// last shift runs past midnight.
export function cardWindow(entries: DayCardEntry[]): {
  start: string | null;
  end: string | null;
  endNextDay: boolean;
} {
  if (entries.length === 0) return { start: null, end: null, endNextDay: false };
  const first = entries[0].day;
  const last = entries[entries.length - 1].day;
  const s = toMinutes(last.start_time);
  const e = toMinutes(last.end_time);
  return {
    start: first.start_time ?? null,
    end: last.end_time ?? null,
    endNextDay: !!last.end_next_day || (s != null && e != null && e < s),
  };
}

// Merge key helper for driver schedule events, one entry per booking per
// date. Pure so it can be checked without React.
export function mergeByKey<T>(
  items: T[],
  keyOf: (t: T) => string
): T[][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.values()];
}
