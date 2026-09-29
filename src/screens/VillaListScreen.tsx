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
import { useVillas } from "@/hooks/useVillas";
import type { Villa, VillaArea, VillaListFilters } from "@/api/types";
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

function prettyArea(area: VillaArea): string {
  return (
    AREA_FILTERS.find((f) => f.key === area)?.label ??
    area.replace(/_/g, " ")
  );
}

export default function VillaListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [areaFilter, setAreaFilter] = useState<VillaArea | "all">("all");

  const apiFilters: VillaListFilters | undefined = useMemo(() => {
    const f: VillaListFilters = {};
    if (statusFilter === "active") f.is_active = true;
    if (statusFilter === "featured") f.is_featured = true;
    if (areaFilter !== "all") f.area = areaFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [statusFilter, areaFilter]);

  const villasQuery = useVillas(apiFilters);
  const data = villasQuery.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={data}
        keyExtractor={(v) => String(v.id)}
        refreshControl={
          <RefreshControl
            refreshing={villasQuery.isRefetching}
            onRefresh={() => villasQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Header now lives on the parent AccommodationScreen — this
                list is hosted inside a toggle so it drops its own eyebrow. */}
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
          villasQuery.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : villasQuery.error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Couldn't load villas.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No villas yet.</Text>
              <Text style={styles.emptyHint}>
                Tap + to add your first villa.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <VillaCard
            villa={item}
            onPress={() =>
              navigation.navigate("VillaDetail", { villaId: item.id })
            }
          />
        )}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color={colors.onPrimary}
        onPress={() => navigation.navigate("VillaEdit", {})}
      />
    </View>
  );
}

function VillaCard({
  villa,
  onPress,
}: {
  villa: Villa;
  onPress: () => void;
}) {
  // Prefer the featured cover photo; fall back to first cover_photos entry,
  // then to the flat images[] array the backend also returns.
  const cover =
    villa.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
    villa.cover_photos?.[0]?.cover_photos ??
    villa.images?.[0];

  const isInactive = !villa.is_active;
  const isFeatured = villa.is_featured;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <ShimmerImage
        uri={cover}
        style={styles.cardImage}
        fallback={
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Text style={styles.cardImageInitial}>
              {villa.name[0] ?? "?"}
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
            {villa.name}
          </Text>
          <View style={styles.cardArea}>
            <Text style={styles.cardAreaText}>
              {prettyArea(villa.area).toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {villa.bedrooms} bed
          {`  ·  ${villa.bathrooms} bath`}
          {`  ·  sleeps ${villa.max_guests}`}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardLocation} numberOfLines={1}>
            {villa.location || prettyArea(villa.area)}
          </Text>
          <Text style={styles.cardPrice}>
            {villa.price_currency || "ZAR"} {villa.price_per_night}/nt
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { paddingBottom: 96 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  headerEyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  headerTitle: {
    color: colors.heading,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSubtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },

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

  areaRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
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
  pillFeatured: {
    backgroundColor: colors.primary,
  },
  pillFeaturedText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  pillInactive: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
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
  cardMeta: { color: colors.muted, fontSize: 13 },
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
