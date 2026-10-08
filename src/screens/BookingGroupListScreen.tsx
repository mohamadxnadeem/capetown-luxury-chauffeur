import React, { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAdminBookingGroups } from "@/hooks/useBookingGroups";
import {
  bookingDateRange,
  type BookingGroup,
  type BookingStatus,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { colors, gradientPrimary } from "@/theme";

type StatusFilter = "all" | BookingStatus;

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

// "2026-10-07" → "7 Oct"
function shortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en", { day: "numeric", month: "short" });
}

// For a group's list of children, compute the overall date range —
// earliest first-day to latest last-day — so the row shows "when" at a
// glance. Defensive: the LIST endpoint may return groups without the
// nested bookings[] array (that payload belongs on the DETAIL endpoint),
// in which case we return empty strings and the row shows "No dates".
function groupDateRange(g: BookingGroup): [string, string] {
  const bookings = g.bookings ?? [];
  let earliest = "";
  let latest = "";
  for (const b of bookings) {
    const [start, end] = bookingDateRange(b);
    if (start && (!earliest || start < earliest)) earliest = start;
    if (end && (!latest || end > latest)) latest = end;
  }
  return [earliest, latest];
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

export default function BookingGroupListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const groupsQuery = useAdminBookingGroups();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const groups = useMemo(() => {
    const all = groupsQuery.data ?? [];
    const filtered =
      filter === "all" ? all : all.filter((g) => g.status === filter);
    // Sort by earliest booking date ascending — soonest first — so the
    // list reads in trip order. Groups with no bookings (shouldn't happen
    // but defensive) fall to the end by created_at.
    return [...filtered].sort((a, b) => {
      const [sa] = groupDateRange(a);
      const [sb] = groupDateRange(b);
      if (sa && sb) return sa.localeCompare(sb);
      if (sa) return -1;
      if (sb) return 1;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });
  }, [groupsQuery.data, filter]);

  return (
    <View style={styles.root}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={groups}
        keyExtractor={(g) => String(g.id)}
        refreshControl={
          <RefreshControl
            refreshing={groupsQuery.isRefetching}
            onRefresh={() => groupsQuery.refetch()}
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
              <Text style={styles.heroTitle}>Multi-vehicle bookings</Text>
              <Text style={styles.heroSubtitle}>
                {groupsQuery.isLoading
                  ? "Loading…"
                  : `${groups.length} ${
                      filter === "all" ? "total" : filter
                    } booking${groups.length === 1 ? "" : "s"}`}
              </Text>
            </LinearGradient>

            {/* Status filter chips */}
            <View style={styles.filterRow}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    activeOpacity={0.85}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
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
          groupsQuery.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : groupsQuery.error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Couldn't load bookings.
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {filter === "all"
                  ? "No multi-vehicle bookings yet."
                  : `No ${filter} bookings.`}
              </Text>
              <Text style={styles.emptyHint}>
                Build one from any booking's "+ Add another vehicle" button.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <GroupRow
            group={item}
            onPress={() =>
              navigation.navigate("BookingGroupDetail", { groupId: item.id })
            }
          />
        )}
      />
    </View>
  );
}

function GroupRow({
  group,
  onPress,
}: {
  group: BookingGroup;
  onPress: () => void;
}) {
  const [earliest, latest] = groupDateRange(group);
  // Defensive: bookings[] may be missing on the list payload (vs the
  // detail payload). Fall back to a "?" rather than crashing.
  const bookings = group.bookings ?? [];
  const vehicleCount = bookings.filter((b) => b?.car).length;
  const dateLabel = earliest
    ? earliest === latest
      ? shortDate(earliest)
      : `${shortDate(earliest)} → ${shortDate(latest)}`
    : "No dates";
  const tone = statusTone(group.status);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.refBadge}>
          <Text style={styles.refBadgeText}>↔</Text>
        </View>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowRef} numberOfLines={1}>
          {group.group_reference}
        </Text>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {group.title || `Trip for ${group.customer_name || "client"}`}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {group.customer_name}
          {vehicleCount > 0
            ? `  ·  ${vehicleCount} ${vehicleCount === 1 ? "vehicle" : "vehicles"}`
            : ""}
        </Text>
        <Text style={styles.rowDate} numberOfLines={1}>
          📅 {dateLabel}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.pill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.pillText, { color: tone.fg }]}>
            {group.status.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.rowRightTotal}>
          {group.currency || "ZAR"} {group.total_client_amount}
        </Text>
        {group.is_paid ? (
          <View style={[styles.pill, styles.paidPill]}>
            <Text style={styles.paidPillText}>✓ PAID</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { paddingBottom: 32 },
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
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    marginTop: 4,
    textTransform: "capitalize",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  emptyText: {
    color: colors.text,
    fontWeight: "600",
    marginBottom: 6,
    fontSize: 14,
  },
  emptyHint: { color: colors.muted, fontSize: 12, textAlign: "center" },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
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
  rowLeft: { marginRight: 10 },
  refBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(11,91,51,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  refBadgeText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: "800",
  },
  rowBody: { flex: 1 },
  rowRef: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  rowTitle: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  rowDate: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  rowRight: {
    alignItems: "flex-end",
    marginLeft: 10,
    gap: 6,
  },
  rowRightTotal: {
    color: colors.heading,
    fontSize: 13,
    fontWeight: "800",
  },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  paidPill: { backgroundColor: colors.primary },
  paidPillText: {
    color: colors.onPrimary,
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "800",
  },
});
