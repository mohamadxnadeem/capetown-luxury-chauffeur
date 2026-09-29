import React, { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, FAB, Text } from "react-native-paper";
import { ShimmerImage } from "@/components/ShimmerImage";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHotels } from "@/hooks/useHotels";
import type { Hotel, HotelListFilters, VillaArea } from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

type StatusFilter = "all" | "active" | "featured";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "featured", label: "Featured" },
];

const AREA_FILTERS: { key: VillaArea | "all"; label: string }[] = [
  { key: "all", label: "All areas" },
  { key: "camps_bay", label: "Camps Bay" },
  { key: "clifton", label: "Clifton" },
  { key: "bantry_bay", label: "Bantry Bay" },
  { key: "constantia", label: "Constantia" },
  { key: "franschhoek", label: "Franschhoek" },
  { key: "stellenbosch", label: "Stellenbosch" },
  { key: "other", label: "Other" },
];

// Hotel `area` is a free-form string on the backend (e.g. "Camps Bay" or
// "city-bowl"), not the VillaArea enum. Match a known key when possible,
// otherwise clean up the raw string for display.
function prettyArea(area: string | null | undefined): string {
  if (!area) return "—";
  const hit = AREA_FILTERS.find((f) => f.key === area);
  if (hit) return hit.label;
  return area.replace(/[-_]+/g, " ");
}

export default function HotelListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [areaFilter, setAreaFilter] = useState<VillaArea | "all">("all");

  const apiFilters: HotelListFilters | undefined = useMemo(() => {
    const f: HotelListFilters = {};
    if (statusFilter === "active") f.is_active = true;
    if (statusFilter === "featured") f.is_featured = true;
    if (areaFilter !== "all") f.area = areaFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [statusFilter, areaFilter]);

  const hotelsQuery = useHotels(apiFilters);
  const data = hotelsQuery.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={data}
        keyExtractor={(h) => String(h.id)}
        refreshControl={
          <RefreshControl
            refreshing={hotelsQuery.isRefetching}
            onRefresh={() => hotelsQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.filterRow}>
              {STATUS_FILTERS.map((f) => {
                const active = statusFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setStatusFilter(f.key)}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.areaRow}
            >
              {AREA_FILTERS.map((f) => {
                const active = areaFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setAreaFilter(f.key)}
                    activeOpacity={0.85}
                    style={[
                      styles.areaChip,
                      active && styles.areaChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.areaChipText,
                        active && styles.areaChipTextActive,
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        }
        ListEmptyComponent={
          hotelsQuery.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : hotelsQuery.error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Couldn't load hotels.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No hotels yet.</Text>
              <Text style={styles.emptyHint}>
                Tap + to add your first hotel.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <HotelCard
            hotel={item}
            onPress={() =>
              navigation.navigate("HotelDetail", { hotelId: item.id })
            }
          />
        )}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color={colors.onPrimary}
        onPress={() => navigation.navigate("HotelEdit", {})}
      />
    </View>
  );
}

function HotelCard({
  hotel,
  onPress,
}: {
  hotel: Hotel;
  onPress: () => void;
}) {
  const cover =
    hotel.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
    hotel.cover_photos?.[0]?.cover_photos ??
    hotel.images?.[0];

  const isInactive = !hotel.is_active;
  const isFeatured = hotel.is_featured;

  const stars = "★".repeat(hotel.star_rating || 0) +
    "☆".repeat(Math.max(0, 5 - (hotel.star_rating || 0)));

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <ShimmerImage
        uri={cover}
        style={styles.cardImage}
        fallback={
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Text style={styles.cardImageInitial}>
              {hotel.name[0] ?? "?"}
            </Text>
          </View>
        }
      />

      {isInactive || isFeatured ? (
        <View style={styles.cardOverlayPills}>
          {isFeatured ? (
            <View style={[styles.cardOverlayPill, styles.pillFeatured]}>
              <Text style={styles.pillFeaturedText}>FEATURED</Text>
            </View>
          ) : null}
          {isInactive ? (
            <View style={[styles.cardOverlayPill, styles.pillInactive]}>
              <Text style={styles.pillInactiveText}>HIDDEN</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {hotel.name}
          </Text>
          <View style={styles.cardArea}>
            <Text style={styles.cardAreaText}>
              {prettyArea(hotel.area).toUpperCase()}
            </Text>
          </View>
        </View>
        {hotel.star_rating ? (
          <Text style={styles.cardStars}>{stars}</Text>
        ) : null}
        <Text style={styles.cardMeta} numberOfLines={1}>
          {hotel.bedrooms_available ? `${hotel.bedrooms_available} rooms` : ""}
          {hotel.max_guests ? `  ·  sleeps ${hotel.max_guests}` : ""}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardLocation} numberOfLines={1}>
            {hotel.location || prettyArea(hotel.area)}
          </Text>
          <Text style={styles.cardPrice}>
            from {hotel.price_currency || "ZAR"} {hotel.price_per_night_from}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { paddingBottom: 96, paddingTop: 12 },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
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
    letterSpacing: 0.4,
  },
  filterChipTextActive: { color: colors.onPrimary },

  areaRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  areaChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  areaChipActive: {
    backgroundColor: colors.heading,
    borderColor: colors.heading,
  },
  areaChipText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  areaChipTextActive: { color: colors.onPrimary },

  empty: { padding: 32, alignItems: "center" },
  emptyText: { color: colors.text, fontWeight: "600" },
  emptyHint: { color: colors.muted, fontSize: 13, marginTop: 4 },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardImage: { width: "100%", height: 180, backgroundColor: colors.surfaceMuted },
  cardImageFallback: { alignItems: "center", justifyContent: "center" },
  cardImageInitial: { color: colors.primary, fontSize: 48, fontWeight: "800" },

  cardOverlayPills: {
    position: "absolute",
    top: 12,
    right: 12,
    gap: 6,
    alignItems: "flex-end",
  },
  cardOverlayPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillFeatured: { backgroundColor: colors.primary },
  pillFeaturedText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  pillInactive: { backgroundColor: "rgba(0,0,0,0.55)" },
  pillInactiveText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },

  cardBody: { padding: 14 },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardTitle: {
    color: colors.heading,
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  cardArea: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  cardAreaText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  cardStars: { color: "#c98c1a", fontSize: 13, letterSpacing: 1, marginTop: 2 },
  cardMeta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  cardLocation: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 },
  cardPrice: { color: colors.primary, fontSize: 14, fontWeight: "800" },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: colors.primary,
  },
});
