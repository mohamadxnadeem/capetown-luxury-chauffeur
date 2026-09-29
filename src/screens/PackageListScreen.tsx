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
import { usePackages } from "@/hooks/usePackages";
import type {
  PackageCategory,
  PackageListFilters,
  TravelPackage,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

type StatusFilter = "all" | "active" | "featured";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "featured", label: "Featured" },
];

const CATEGORY_FILTERS: { key: PackageCategory | "all"; label: string }[] = [
  { key: "all", label: "All categories" },
  { key: "cape_town_week", label: "Cape Town Week" },
  { key: "winelands_escape", label: "Winelands Escape" },
  { key: "family_cape_town", label: "Family Cape Town" },
  { key: "custom", label: "Custom" },
];

function prettyCategory(c: PackageCategory): string {
  return (
    CATEGORY_FILTERS.find((f) => f.key === c)?.label ??
    c.replace(/_/g, " ")
  );
}

export default function PackageListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] =
    useState<PackageCategory | "all">("all");

  const apiFilters: PackageListFilters | undefined = useMemo(() => {
    const f: PackageListFilters = {};
    if (statusFilter === "active") f.is_active = true;
    if (statusFilter === "featured") f.is_featured = true;
    if (categoryFilter !== "all") f.category = categoryFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  }, [statusFilter, categoryFilter]);

  const packagesQuery = usePackages(apiFilters);
  const data = packagesQuery.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={data}
        keyExtractor={(p) => String(p.id)}
        refreshControl={
          <RefreshControl
            refreshing={packagesQuery.isRefetching}
            onRefresh={() => packagesQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.headerEyebrow}>PACKAGES</Text>
              <Text style={styles.headerTitle}>Travel packages</Text>
              <Text style={styles.headerSubtitle}>
                Curated multi-day experiences shown on
                capetown-concierge.co.za.
              </Text>
            </View>
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
              contentContainerStyle={styles.categoryRow}
            >
              {CATEGORY_FILTERS.map((f) => {
                const active = categoryFilter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setCategoryFilter(f.key)}
                    activeOpacity={0.85}
                    style={[
                      styles.categoryChip,
                      active && styles.categoryChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        active && styles.categoryChipTextActive,
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
          packagesQuery.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : packagesQuery.error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Couldn't load packages.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No packages yet.</Text>
              <Text style={styles.emptyHint}>
                Tap + to create your first package.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <PackageCard
            pkg={item}
            onPress={() =>
              navigation.navigate("PackageEdit", { packageId: item.id })
            }
          />
        )}
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color={colors.onPrimary}
        onPress={() => navigation.navigate("PackageEdit", {})}
      />
    </View>
  );
}

function PackageCard({
  pkg,
  onPress,
}: {
  pkg: TravelPackage;
  onPress: () => void;
}) {
  // Hero selection — featured cover, then first cover, then flat images.
  const cover =
    pkg.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
    pkg.cover_photos?.[0]?.cover_photos ??
    pkg.images?.[0];

  const isInactive = !pkg.is_active;
  const isFeatured = pkg.is_featured;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <ShimmerImage
        uri={cover}
        style={styles.cardImage}
        fallback={
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Text style={styles.cardImageInitial}>{pkg.name[0] ?? "?"}</Text>
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
            {pkg.name}
          </Text>
          <View style={styles.cardCategory}>
            <Text style={styles.cardCategoryText}>
              {prettyCategory(pkg.category).toUpperCase()}
            </Text>
          </View>
        </View>
        {pkg.tagline ? (
          <Text style={styles.cardTagline} numberOfLines={1}>
            {pkg.tagline}
          </Text>
        ) : null}
        <Text style={styles.cardMeta} numberOfLines={1}>
          {pkg.duration_nights
            ? `${pkg.duration_nights} night${pkg.duration_nights === 1 ? "" : "s"}`
            : "—"}
          {pkg.max_guests ? `  ·  ${pkg.max_guests} guests` : ""}
          {pkg.villa?.name ? `  ·  ${pkg.villa.name}` : ""}
        </Text>
        {pkg.price_from ? (
          <Text style={styles.cardPrice}>
            From {pkg.price_currency || "ZAR"} {pkg.price_from}
          </Text>
        ) : null}
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

  categoryRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.heading,
    borderColor: colors.heading,
  },
  categoryChipText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  categoryChipTextActive: { color: colors.onPrimary },

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
  cardCategory: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  cardCategoryText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  cardTagline: {
    color: colors.text,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 2,
  },
  cardMeta: { color: colors.muted, fontSize: 13, marginTop: 6 },
  cardPrice: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 6,
  },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: colors.primary,
  },
});
