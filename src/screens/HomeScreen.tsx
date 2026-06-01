import React, { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ShimmerImage } from "@/components/ShimmerImage";
import { ActivityIndicator, Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAdminBookings } from "@/hooks/useBookings";
import { useVehicles } from "@/hooks/useVehicles";
import { bookingDateRange, type Booking, type BookingStatus } from "@/api/types";
import { colors, gradientPrimary } from "@/theme";
import type { RootStackParamList } from "@/navigation/types";

type StatusFilter = "all" | BookingStatus;

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
  const vehiclesQuery = useVehicles();

  const [filter, setFilter] = useState<StatusFilter>("all");

  // Vehicle cover photos aren't always on the lean bookings-list response,
  // so resolve them from the full vehicle list by car id.
  const coverById = useMemo(() => {
    const m = new Map<number, string | undefined>();
    for (const v of vehiclesQuery.data ?? []) {
      const cover =
        v.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
        v.cover_photos?.[0]?.cover_photos;
      m.set(v.id, cover);
    }
    return m;
  }, [vehiclesQuery.data]);

  const bookings = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const filtered =
      filter === "all" ? all : all.filter((b) => b.status === filter);
    // Newest first — created_at is always present on the list response.
    return [...filtered].sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? "")
    );
  }, [bookingsQuery.data, filter]);

  // "Starting soon": pending/confirmed bookings whose first date falls within
  // the next 7 days (today inclusive). Sorted by start date ascending so the
  // most imminent ones surface first.
  const startingSoon = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 7);
    const upcoming: { booking: Booking; start: string }[] = [];
    for (const b of all) {
      if (b.status === "cancelled" || b.status === "completed") continue;
      const [start] = bookingDateRange(b);
      if (!start) continue;
      const startDate = new Date(`${start}T00:00:00`);
      if (startDate >= today && startDate <= horizon) {
        upcoming.push({ booking: b, start });
      }
    }
    upcoming.sort((a, b) => a.start.localeCompare(b.start));
    return upcoming.map((u) => u.booking);
  }, [bookingsQuery.data]);

  function viewBooking(b: Booking) {
    navigation.navigate("BookingDetail", { bookingId: b.id });
  }

  return (
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

          {/* CTA: search vehicles available for a date range */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate("VehicleSearch")}
            style={styles.ctaCard}
          >
            <View style={styles.ctaIcon}>
              <Text style={styles.ctaIconText}>⌕</Text>
            </View>
            <View style={styles.ctaTextWrap}>
              <Text style={styles.ctaTitle}>Find available vehicles</Text>
              <Text style={styles.ctaSubtitle}>
                Enter dates to see which vehicles are free, then book.
              </Text>
            </View>
            <Text style={styles.ctaChevron}>›</Text>
          </TouchableOpacity>

          {/* Starting soon — bookings whose first day is within 7 days */}
          {startingSoon.length > 0 ? (
            <View style={styles.soonSection}>
              <View style={styles.soonHeader}>
                <Text style={styles.soonTitle}>Starting soon</Text>
                <Text style={styles.soonCount}>
                  {startingSoon.length} in the next 7 days
                </Text>
              </View>
              {startingSoon.map((b) => (
                <SoonRow
                  key={b.id}
                  booking={b}
                  coverUrl={
                    (b.car?.id != null
                      ? coverById.get(b.car.id)
                      : undefined) ??
                    b.car?.cover_photos?.find((p) => p.is_featured)
                      ?.cover_photos ??
                    b.car?.cover_photos?.[0]?.cover_photos
                  }
                  onPress={() => viewBooking(b)}
                />
              ))}
            </View>
          ) : null}

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
            (item.car?.id != null ? coverById.get(item.car.id) : undefined) ??
            item.car?.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
            item.car?.cover_photos?.[0]?.cover_photos
          }
          onPress={() => viewBooking(item)}
        />
      )}
    />
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
  const dateLabel = isMulti
    ? `${prettyDate(start)} → ${prettyDate(end)}`
    : prettyDate(start);
  const firstDay = booking.days?.[0];
  const timeLabel = firstDay?.start_time
    ? `${firstDay.start_time.slice(0, 5)}${
        firstDay.end_time ? ` – ${firstDay.end_time.slice(0, 5)}` : ""
      }`
    : null;
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
        <Text style={styles.soonWhen}>{daysAwayLabel(start)}</Text>
        <Text style={styles.soonCustomer} numberOfLines={1}>
          {booking.customer_name || `Booking #${booking.id}`}
        </Text>
        <Text style={styles.soonMeta} numberOfLines={1}>
          {booking.car?.title}
          {timeLabel ? `  ·  ${timeLabel}` : ""}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowRightDate} numberOfLines={2}>
          {dateLabel}
        </Text>
        <StatusPill status={booking.status} />
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
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 24 },
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
});
