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
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookingsQuery.data ?? []) {
      if (b.status === "cancelled") continue;
      const [start, end] = bookingDateRange(b);
      for (const d of datesInRange(start, end)) {
        (map.get(d) ?? map.set(d, []).get(d)!).push(b);
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
      if (list.length > 1) {
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

  const dayBookings = bookingsByDate.get(selectedDate) ?? [];
  // Order by earliest start_time so the operator reads the day top-to-bottom
  // as it will unfold.
  const orderedDayBookings = useMemo(() => {
    return [...dayBookings].sort((a, b) => {
      const ta = a.days?.find((d) => d.date === selectedDate)?.start_time
        ?? a.days?.[0]?.start_time
        ?? "99:99:99";
      const tb = b.days?.find((d) => d.date === selectedDate)?.start_time
        ?? b.days?.[0]?.start_time
        ?? "99:99:99";
      return ta.localeCompare(tb);
    });
  }, [dayBookings, selectedDate]);

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
          {orderedDayBookings.length === 0
            ? "No trips scheduled"
            : `${orderedDayBookings.length} ${orderedDayBookings.length === 1 ? "trip" : "trips"}`}
        </Text>
      </View>

      {bookingsQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : orderedDayBookings.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Nothing on the calendar for this day.
          </Text>
        </View>
      ) : (
        orderedDayBookings.map((b) => {
          const day = b.days?.find((d) => d.date === selectedDate);
          const startTime = day?.start_time
            ? day.start_time.slice(0, 5)
            : b.days?.[0]?.start_time?.slice(0, 5) ?? "—";
          const endTime = day?.end_time
            ? day.end_time.slice(0, 5)
            : b.days?.[0]?.end_time?.slice(0, 5) ?? null;
          const cover =
            b.car?.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
            b.car?.cover_photos?.[0]?.cover_photos;
          return (
            <TouchableOpacity
              key={b.id}
              activeOpacity={0.85}
              onPress={() =>
                navigation.navigate("BookingDetail", { bookingId: b.id })
              }
              style={styles.dayRow}
            >
              <View style={styles.dayRowTime}>
                <Text style={styles.dayRowTimeText}>{startTime}</Text>
                {endTime ? (
                  <Text style={styles.dayRowTimeEnd}>{endTime}</Text>
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
                  {b.driver?.full_name
                    ? `  ·  ${b.driver.full_name}`
                    : ""}
                </Text>
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
