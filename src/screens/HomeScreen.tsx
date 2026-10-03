import React, { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ShimmerImage } from "@/components/ShimmerImage";
import { ActivityIndicator, FAB, Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAdminBookings } from "@/hooks/useBookings";
import { bookingDateRange, type Booking, type BookingStatus } from "@/api/types";
import { colors, gradientPrimary } from "@/theme";
import type { RootStackParamList } from "@/navigation/types";

type StatusFilter = "all" | BookingStatus;

// One entry per upcoming scheduled day inside the next 7-day window. A
// multi-day booking expands into one UpcomingDay per day — so a booking
// with days Oct 1 & Oct 10 produces two separate rows, and marking the
// first day as past doesn't hide the second.
interface UpcomingDay {
  booking: Booking;
  dayDate: string; // YYYY-MM-DD, THIS specific day
  startTime: string | null; // HH:MM:SS for this day
  endTime: string | null;
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export default function HomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const bookingsQuery = useAdminBookings();

  const [filter, setFilter] = useState<StatusFilter>("all");

  const bookings = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const filtered =
      filter === "all" ? all : all.filter((b) => b.status === filter);
    // Sort by the trip's actual START date ascending — soonest first, so
    // the operator reads the list in the order trips will happen. Falls
    // back to created_at only when the start date is unknown so those
    // rows still have a stable position at the end. This replaces the
    // old "newest-created first" sort which buried imminent trips.
    return [...filtered].sort((a, b) => {
      const [sa] = bookingDateRange(a);
      const [sb] = bookingDateRange(b);
      if (sa && sb) return sa.localeCompare(sb);
      if (sa) return -1;
      if (sb) return 1;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [bookingsQuery.data, filter]);

  // Upcoming (non-cancelled, non-completed) bookings expanded ONE ROW PER
  // UPCOMING DAY within the next 7-day window.
  //
  // Why per-day expansion instead of per-booking:
  //   - A booking with days on Oct 1 and Oct 10, viewed on Oct 3:
  //     the previous per-booking logic used bookingDateRange()[0] (= Oct 1)
  //     and dropped the whole booking because its "start" was in the past.
  //     Operator lost sight of the Oct 10 leg entirely.
  //   - A booking with contiguous days Oct 1-5, viewed on Oct 3: same bug —
  //     start = Oct 1 → excluded, so Oct 3/4/5 vanished even though they
  //     were the actual next trips.
  //
  // New behavior: iterate every day of every active booking; include the
  // (booking, day) pair if that specific day falls in the window. Each pair
  // renders as its own SoonRow — a multi-day booking appears multiple times
  // (one per upcoming day), each with that day's specific date and time.
  //
  // Fallback for accommodation-only bookings (no days[]): use the booking's
  // start_date as the single trigger date, since those are continuous stays
  // not per-day scheduled trips.
  const upcomingWeek = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = isoLocal(today);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 7);
    const horizonIso = isoLocal(horizon);

    const upcoming: UpcomingDay[] = [];
    for (const b of all) {
      if (b.status === "cancelled" || b.status === "completed") continue;
      if (Array.isArray(b.days) && b.days.length > 0) {
        for (const d of b.days) {
          if (d.date >= todayIso && d.date <= horizonIso) {
            upcoming.push({
              booking: b,
              dayDate: d.date,
              startTime: d.start_time,
              endTime: d.end_time,
            });
          }
        }
      } else {
        const [start] = bookingDateRange(b);
        if (start && start >= todayIso && start <= horizonIso) {
          upcoming.push({
            booking: b,
            dayDate: start,
            startTime: null,
            endTime: null,
          });
        }
      }
    }
    upcoming.sort((a, b) => {
      const dateCmp = a.dayDate.localeCompare(b.dayDate);
      if (dateCmp !== 0) return dateCmp;
      const ta = a.startTime ?? "99:99:99";
      const tb = b.startTime ?? "99:99:99";
      return ta.localeCompare(tb);
    });
    return upcoming;
  }, [bookingsQuery.data]);

  function viewBooking(b: Booking) {
    navigation.navigate("BookingDetail", { bookingId: b.id });
  }

  return (
    <View style={styles.root}>
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={bookings}
      keyExtractor={(b) => String(b.id)}
      refreshControl={
        <RefreshControl
          refreshing={bookingsQuery.isRefetching}
          onRefresh={() => bookingsQuery.refetch()}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <>
          <LinearGradient
            colors={gradientPrimary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroEyebrow}>CAPE TOWN CONCIERGE</Text>
            <Text style={styles.heroTitle}>Bookings</Text>
            <Text style={styles.heroSubtitle}>
              {bookingsQuery.isLoading
                ? "Loading…"
                : `${bookings.length} ${
                    filter === "all" ? "total" : filter
                  } booking${bookings.length === 1 ? "" : "s"}`}
            </Text>
          </LinearGradient>

          {/* Full-width CTA: open the month calendar. */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate("BookingCalendar")}
            style={styles.ctaCard}
          >
            <View style={styles.ctaIcon}>
              <Text style={styles.ctaIconText}>📅</Text>
            </View>
            <View style={styles.ctaTextWrap}>
              <Text style={styles.ctaTitle}>Calendar</Text>
              <Text style={styles.ctaSubtitle}>
                See every trip by day. Tap any date for details.
              </Text>
            </View>
            <Text style={styles.ctaChevron}>›</Text>
          </TouchableOpacity>

          {/* Upcoming this week — one flat list, sorted by start date so the
              operator reads it in the order trips will happen. Each row
              carries a "Today" / "Tomorrow" / "in N days" label + the trip's
              start time so today's jobs still stand out visually. */}
          <View style={styles.soonSection}>
            <View style={styles.soonHeader}>
              <Text style={styles.soonTitle}>Upcoming this week</Text>
              <Text style={styles.soonCount}>
                {upcomingWeek.length}{" "}
                {upcomingWeek.length === 1 ? "trip" : "trips"}
              </Text>
            </View>
            {upcomingWeek.length === 0 ? (
              <View style={styles.upcomingEmptyCard}>
                <Text style={styles.upcomingEmptyText}>
                  No trips in the next 7 days.
                </Text>
              </View>
            ) : (
              upcomingWeek.map((entry) => (
                <SoonRow
                  // Composite key — the same booking can appear multiple
                  // times, one row per upcoming day.
                  key={`${entry.booking.id}-${entry.dayDate}`}
                  entry={entry}
                  coverUrl={
                    entry.booking.car?.cover_photos?.find((p) => p.is_featured)
                      ?.cover_photos ??
                    entry.booking.car?.cover_photos?.[0]?.cover_photos
                  }
                  onPress={() => viewBooking(entry.booking)}
                />
              ))
            )}
          </View>

          {/* Status filter chips */}
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.85}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      }
      ListEmptyComponent={
        bookingsQuery.isLoading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : bookingsQuery.error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Couldn't load bookings.</Text>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {filter === "all"
                ? "No bookings yet."
                : `No ${filter} bookings.`}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <BookingRow
          booking={item}
          coverUrl={
            item.car?.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
            item.car?.cover_photos?.[0]?.cover_photos
          }
          onPress={() => viewBooking(item)}
        />
      )}
    />
    <FAB
      icon="plus"
      style={styles.fab}
      color={colors.onPrimary}
      onPress={() => navigation.navigate("NewBooking")}
    />
    </View>
  );
}

// "2026-06-12" → "12 June 2026" — day, full month name, year.
function prettyDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Format a Date's LOCAL year/month/day as YYYY-MM-DD. Can't use
// toISOString().slice(0,10) — that returns UTC, so in SAST (UTC+2) new
// Date() with hours=0 lands on YESTERDAY once serialised, which was why
// the calendar screen wasn't rendering booking dots.
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "2026-06-12" → "Today" / "Tomorrow" / "in 3 days" for the Starting Soon row.
function daysAwayLabel(iso: string): string {
  if (!iso) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${iso}T00:00:00`);
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `in ${diff} days`;
}

function SoonRow({
  entry,
  coverUrl,
  onPress,
}: {
  entry: UpcomingDay;
  coverUrl?: string;
  onPress: () => void;
}) {
  const { booking, dayDate, startTime, endTime } = entry;
  const timeLabel = startTime
    ? `${startTime.slice(0, 5)}${endTime ? ` – ${endTime.slice(0, 5)}` : ""}`
    : null;
  // When the booking spans multiple days, mark this row as "Day N of M"
  // so the operator knows at a glance it's one leg of a longer trip, not
  // a solo booking.
  const totalDays = booking.days?.length ?? 1;
  const dayIndex =
    (booking.days?.findIndex((d) => d.date === dayDate) ?? -1) + 1;
  const legLabel =
    totalDays > 1 && dayIndex > 0 ? `Day ${dayIndex} of ${totalDays}` : null;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.soonRow}
    >
      <ShimmerImage
        uri={coverUrl}
        style={styles.soonImage}
        fallback={
          <View style={[styles.soonImage, styles.rowImageFallback]}>
            <Text style={styles.rowImageInitial}>
              {booking.car?.title?.[0] ?? "?"}
            </Text>
          </View>
        }
      />
      <View style={styles.soonBody}>
        <Text style={styles.soonWhen}>{daysAwayLabel(dayDate)}</Text>
        <Text style={styles.soonCustomer} numberOfLines={1}>
          {booking.customer_name || `Booking #${booking.id}`}
        </Text>
        <Text style={styles.soonMeta} numberOfLines={1}>
          {booking.car?.title}
          {timeLabel ? `  ·  ${timeLabel}` : ""}
          {legLabel ? `  ·  ${legLabel}` : ""}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowRightDate} numberOfLines={2}>
          {prettyDate(dayDate)}
        </Text>
        <StatusPill status={booking.status} />
        {booking.is_paid ? <PaidPill /> : null}
      </View>
    </TouchableOpacity>
  );
}

function BookingRow({
  booking,
  coverUrl,
  onPress,
}: {
  booking: Booking;
  coverUrl?: string;
  onPress: () => void;
}) {
  const [start, end] = bookingDateRange(booking);
  const isMulti = start !== end && end !== "";
  const dateLabel = start
    ? isMulti
      ? `${prettyDate(start)} → ${prettyDate(end)}`
      : prettyDate(start)
    : null;

  // First day's time window, when the list response carries days.
  const firstDay = booking.days?.[0];
  const timeLabel =
    firstDay?.start_time
      ? `${firstDay.start_time.slice(0, 5)}${
          firstDay.end_time ? ` – ${firstDay.end_time.slice(0, 5)}` : ""
        }`
      : null;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.row}>
      <ShimmerImage
        uri={coverUrl}
        style={styles.rowImage}
        fallback={
          <View style={[styles.rowImage, styles.rowImageFallback]}>
            <Text style={styles.rowImageInitial}>
              {booking.car?.title?.[0] ?? "?"}
            </Text>
          </View>
        }
      />
      <View style={styles.rowBody}>
        <Text style={styles.rowCustomer} numberOfLines={1}>
          {booking.customer_name || `Booking #${booking.id}`}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {booking.car?.title}
          {booking.driver?.full_name
            ? `  ·  ${booking.driver.full_name}`
            : "  ·  Unassigned"}
        </Text>
        {timeLabel ? (
          <Text style={styles.rowMetaSub} numberOfLines={1}>
            {timeLabel}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        {dateLabel ? (
          <Text style={styles.rowRightDate} numberOfLines={1}>
            {dateLabel}
          </Text>
        ) : null}
        <StatusPill status={booking.status} />
        {booking.is_paid ? <PaidPill /> : null}
      </View>
    </TouchableOpacity>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

// Small emerald pill shown under the status pill when the client has paid
// (either via Yoco webhook or a manual "Mark as paid" from BookingDetail).
function PaidPill() {
  return (
    <View style={[styles.pill, styles.paidPill]}>
      <Text style={[styles.pillText, styles.paidPillText]}>✓ PAID</Text>
    </View>
  );
}

function statusTone(status: string): { bg: string; fg: string } {
  switch (status) {
    case "confirmed":
      return { bg: "#dff0e7", fg: colors.primary };
    case "completed":
      return { bg: "#eef3f0", fg: colors.muted };
    case "cancelled":
      return { bg: "#f6e3e3", fg: "#b03b3b" };
    default:
      return { bg: "#fdf1d8", fg: "#8a6411" };
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 96 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: colors.primary,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 28,
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    marginBottom: 8,
  },
  heroTitle: {
    color: colors.onPrimary,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    marginTop: 4,
    textTransform: "capitalize",
  },
  ctaCard: {
    marginHorizontal: 16,
    marginTop: -16,
    marginBottom: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaIconText: {
    color: colors.onPrimary,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28,
  },
  ctaTextWrap: { flex: 1, marginLeft: 14 },
  ctaTitle: { color: colors.heading, fontSize: 16, fontWeight: "700" },
  ctaSubtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  ctaChevron: { color: colors.muted, fontSize: 28, marginLeft: 8 },

  // Side-by-side quick-action tiles under the hero: search + calendar.
  ctaRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: -16,
    marginBottom: 14,
  },
  ctaTile: {
    flex: 1,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ctaTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  ctaTileIconText: {
    color: colors.onPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  ctaTileTitle: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "700",
  },
  ctaTileSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  // Today section — the operator's headline "don't forget these trips" card.
  // Loud emerald border/background so it's the first thing the eye lands on.
  todaySection: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#e7f3ec",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  todayHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  todayEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  todayHeaderDate: {
    color: colors.heading,
    fontSize: 13,
    fontWeight: "700",
  },
  todayEmptyCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  todayEmptyText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  todayRow: {
    flexDirection: "row",
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  todayTime: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    paddingVertical: 4,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  todayTimeText: {
    color: colors.onPrimary,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  todayTimeEnd: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    opacity: 0.85,
  },
  todayBody: { flex: 1, justifyContent: "center" },
  todayCustomer: {
    color: colors.heading,
    fontSize: 16,
    fontWeight: "800",
  },
  todayMeta: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  todayPickup: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },

  upcomingEmptyCard: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  upcomingEmptyText: { color: colors.muted, fontSize: 13, fontWeight: "600" },

  soonSection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  soonHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  soonTitle: {
    color: colors.heading,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  soonCount: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  soonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  soonImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  soonBody: { flex: 1, marginLeft: 12, marginRight: 8 },
  soonWhenRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  soonWhen: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  soonDate: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  soonCustomer: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  soonMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },

  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  filterChipTextActive: { color: colors.onPrimary },

  empty: { padding: 32, alignItems: "center" },
  emptyText: { color: colors.text, fontWeight: "600", marginBottom: 4 },
  emptyHint: { color: colors.muted, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  rowImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  rowImageFallback: { alignItems: "center", justifyContent: "center" },
  rowImageInitial: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  rowBody: { flex: 1, marginLeft: 12 },
  rowDate: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  rowCustomer: {
    color: colors.heading,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  rowMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  rowMetaSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  rowRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    marginLeft: 10,
    gap: 6,
  },
  rowRightDate: {
    color: colors.heading,
    fontSize: 12,
    fontWeight: "700",
  },
  rowChevron: { color: colors.muted, fontSize: 24, marginLeft: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  paidPill: { backgroundColor: colors.primary },
  paidPillText: { color: colors.onPrimary, fontSize: 9, letterSpacing: 1 },
});
