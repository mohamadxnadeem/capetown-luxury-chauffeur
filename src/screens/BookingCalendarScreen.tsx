import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAdminBookings } from "@/hooks/useBookings";
import { bookingDateRange, type Booking } from "@/api/types";
import { DayScheduleBar } from "@/components/DayScheduleBar";
import {
  cardWindow,
  dayCardsForDate,
  effectiveDriver,
} from "@/utils/dayShifts";
import { ShimmerImage } from "@/components/ShimmerImage";
import type { RootStackParamList } from "@/navigation/types";
import { calendarTheme, colors } from "@/theme";

// Format a Date's LOCAL year/month/day as YYYY-MM-DD. We can't use
// toISOString().slice(0,10) — that returns UTC, so at midnight in SAST
// (UTC+2) it hands back yesterday's date. That was the reason the
// calendar was drawing no dots even when bookings existed.
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Walk every date in a booking's range (inclusive) and yield local ISO
// dates. A 3-day booking Aug 10-12 → ["2026-08-10","2026-08-11","2026-08-12"]
// so each day the vehicle is on the road gets a calendar dot.
function* datesInRange(startIso: string, endIso: string): Generator<string> {
  if (!startIso) return;
  const start = new Date(`${startIso}T00:00:00`);
  const end = endIso ? new Date(`${endIso}T00:00:00`) : start;
  const cursor = new Date(start);
  while (cursor <= end) {
    yield isoLocal(cursor);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function todayIso(): string {
  return isoLocal(new Date());
}

function prettyLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BookingCalendarScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const bookingsQuery = useAdminBookings();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());

  // Bucket bookings by every date they touch. Ignore cancelled — the calendar
  // is about "what's the fleet doing on this day", not history.
  //
  // Correctness: a booking with days on the 1st and the 10th (but not 2-9)
  // must only mark those two dates. We iterate the explicit days[] array
  // when present. Only when the backend omits days[] (accommodation-only
  // bookings don't have per-day rows) do we fall back to the full
  // first→last range, since that's a continuous stay.
  //
  // Overnight shifts: a day with end_next_day=true also occupies the
  // following calendar day until end_time, so we drop a dot on BOTH
  // dates. The booking only has ONE day row (the start date), but the
  // vehicle is still on the road the next morning.
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    // A booking is listed once per date even when it has 2+ rows that date
    // (split shifts); the card helper merges them for display.
    const push = (date: string, b: Booking) => {
      const list = map.get(date) ?? map.set(date, []).get(date)!;
      if (!list.includes(b)) list.push(b);
    };
    for (const b of bookingsQuery.data ?? []) {
      if (b.status === "cancelled") continue;
      if (Array.isArray(b.days) && b.days.length > 0) {
        for (const day of b.days) {
          push(day.date, b);
          if (day.end_next_day) {
            // Add the next calendar day so the morning tail shows on the
            // calendar. Compute via a local Date to handle month/year
            // rollover cleanly.
            const d = new Date(`${day.date}T00:00:00`);
            d.setDate(d.getDate() + 1);
            push(isoLocal(d), b);
          }
        }
        continue;
      }
      // Accommodation-only: no per-day rows, treat the range as contiguous.
      const [start, end] = bookingDateRange(b);
      for (const d of datesInRange(start, end)) {
        push(d, b);
      }
    }
    return map;
  }, [bookingsQuery.data]);

  // react-native-calendars markedDates: emerald dot when the day has bookings,
  // selected style overrides on the tapped date.
  const markedDates = useMemo(() => {
    const m: Record<
      string,
      {
        marked?: boolean;
        dotColor?: string;
        selected?: boolean;
        selectedColor?: string;
      }
    > = {};
    for (const [d, list] of bookingsByDate) {
      m[d] = { marked: true, dotColor: colors.primary };
      // Merged cards count once (split shifts, same car in one group).
      if (dayCardsForDate(list, d).length > 1) {
        // Multi-booking day — use a darker dot so it stands out from single
        // bookings at a glance.
        m[d].dotColor = colors.primaryDark ?? colors.primary;
      }
    }
    m[selectedDate] = {
      ...(m[selectedDate] ?? {}),
      selected: true,
      selectedColor: colors.primary,
    };
    return m;
  }, [bookingsByDate, selectedDate]);

  // One card per booking (or same car in one group) for the selected date,
  // ordered by earliest start so the operator reads the day top-to-bottom.
  const dayCards = useMemo(() => {
    const cards = dayCardsForDate(
      bookingsByDate.get(selectedDate) ?? [],
      selectedDate
    );
    // Accommodation-only bookings have no day rows; keep them as plain cards.
    for (const b of bookingsByDate.get(selectedDate) ?? []) {
      if (!Array.isArray(b.days) || b.days.length === 0) {
        cards.push({
          key: `b${b.id}-${selectedDate}`,
          entries: [],
          bookings: [b],
          groupId: null,
          firstBooking: b,
        });
      }
    }
    const start = (c: (typeof cards)[number]) =>
      c.entries[0]?.day.start_time ?? "00:00:00";
    // Tail cards (overnight from yesterday) run from midnight, so first.
    return cards.sort((x, y) => start(x).localeCompare(start(y)));
  }, [bookingsByDate, selectedDate]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.calendarShell}>
        <Calendar
          current={selectedDate}
          markedDates={markedDates}
          onDayPress={(d: DateData) => setSelectedDate(d.dateString)}
          theme={calendarTheme}
          enableSwipeMonths
        />
      </View>

      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderDate}>
          {prettyLongDate(selectedDate)}
        </Text>
        <Text style={styles.dayHeaderCount}>
          {dayCards.length === 0
            ? "No trips scheduled"
            : `${dayCards.length} ${dayCards.length === 1 ? "trip" : "trips"}`}
        </Text>
      </View>

      {bookingsQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : dayCards.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Nothing on the calendar for this day.
          </Text>
        </View>
      ) : (
        dayCards.map((card) => {
          const b = card.firstBooking;
          const entries = card.entries;
          const merged = entries.length > 1;
          const first = entries[0]?.day;
          const win = cardWindow(entries);
          const shiftIdx = new Map<number, number>();
          entries.forEach((e, i) => shiftIdx.set(e.day.id, i));
          const dayDriver = first ? effectiveDriver(first, entries[0].booking) : null;
          const startTime = win.start
            ? win.start.slice(0, 5)
            : b.days?.[0]?.start_time?.slice(0, 5) ?? "—";
          const endTime = win.end
            ? win.end.slice(0, 5)
            : b.days?.[0]?.end_time?.slice(0, 5) ?? null;
          const cover =
            b.car?.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
            b.car?.cover_photos?.[0]?.cover_photos;
          return (
            <TouchableOpacity
              key={card.key}
              activeOpacity={0.85}
              onPress={() =>
                card.groupId != null
                  ? navigation.navigate("BookingGroupDetail", {
                      groupId: card.groupId,
                    })
                  : navigation.navigate("BookingDetail", { bookingId: b.id })
              }
              style={styles.dayRow}
            >
              <View style={styles.dayRowTime}>
                <Text style={styles.dayRowTimeText}>{startTime}</Text>
                {endTime ? (
                  <Text style={styles.dayRowTimeEnd}>
                    {endTime}
                    {win.endNextDay ? " +1" : ""}
                  </Text>
                ) : null}
              </View>
              <ShimmerImage
                uri={cover}
                style={styles.dayRowImage}
                fallback={
                  <View style={[styles.dayRowImage, styles.dayRowImageFallback]}>
                    <Text style={styles.dayRowImageInitial}>
                      {b.car?.title?.[0] ?? "?"}
                    </Text>
                  </View>
                }
              />
              <View style={styles.dayRowBody}>
                <Text style={styles.dayRowCustomer} numberOfLines={1}>
                  {b.customer_name || `Booking #${b.id}`}
                </Text>
                <Text style={styles.dayRowMeta} numberOfLines={1}>
                  {b.car?.title ?? "No vehicle"}
                  {!merged && (dayDriver?.full_name ?? b.driver?.full_name)
                    ? `  ·  ${dayDriver?.full_name ?? b.driver?.full_name}`
                    : ""}
                </Text>
                {merged ? (
                  <DayScheduleBar
                    startTime={null}
                    endTime={null}
                    shifts={entries.map((e) => ({
                      startTime: e.day.start_time,
                      endTime: e.day.end_time,
                      endNextDay: !!e.day.end_next_day,
                      color:
                        (shiftIdx.get(e.day.id) ?? 0) === 0
                          ? colors.primary
                          : colors.shiftTwo,
                      label: `Shift ${(shiftIdx.get(e.day.id) ?? 0) + 1}`,
                      driverName:
                        effectiveDriver(e.day, e.booking)?.full_name ?? null,
                    }))}
                  />
                ) : null}
                {b.pickup_location ? (
                  <Text style={styles.dayRowPickup} numberOfLines={1}>
                    📍 {b.pickup_location}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  calendarShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: colors.surface,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  dayHeaderDate: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  dayHeaderCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  loading: { padding: 32, alignItems: "center" },
  emptyCard: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  emptyText: { color: colors.muted, fontSize: 13, fontWeight: "600" },

  dayRow: {
    flexDirection: "row",
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  dayRowTime: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    paddingVertical: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  dayRowTimeText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  dayRowTimeEnd: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    opacity: 0.85,
  },
  dayRowImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    marginRight: 12,
  },
  dayRowImageFallback: { alignItems: "center", justifyContent: "center" },
  dayRowImageInitial: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  dayRowBody: { flex: 1, justifyContent: "center" },
  dayRowCustomer: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "700",
  },
  dayRowMeta: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 2 },
  dayRowPickup: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
