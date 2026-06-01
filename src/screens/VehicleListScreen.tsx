import React, { useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, FAB, Text } from "react-native-paper";
import { ShimmerImage } from "@/components/ShimmerImage";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useVehicles } from "@/hooks/useVehicles";
import type { Vehicle } from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

type VisibilityFilter = "all" | "public" | "hidden";

const FILTERS: { key: VisibilityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "public", label: "On website" },
  { key: "hidden", label: "Hidden" },
];

export default function VehicleListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [filter, setFilter] = useState<VisibilityFilter>("all");

  // Map the visibility chip to the API filter param. "All" sends no filter.
  const apiFilters = useMemo(() => {
    if (filter === "public") return { is_public: true };
    if (filter === "hidden") return { is_public: false };
    return undefined;
  }, [filter]);

  const vehiclesQuery = useVehicles(apiFilters);

  // Admin sees both active and inactive — operator may want to keep
  // inactive vehicles browsable. If you'd rather only show active ones,
  // change this back to .filter((v) => v.is_active).
  const data = vehiclesQuery.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={data}
        keyExtractor={(v) => String(v.id)}
        numColumns={1}
        refreshControl={
          <RefreshControl
            refreshing={vehiclesQuery.isRefetching}
            onRefresh={() => vehiclesQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.headerEyebrow}>FLEET</Text>
              <Text style={styles.headerTitle}>Your vehicles</Text>
              <Text style={styles.headerSubtitle}>
                Tap a vehicle to view its calendar and create a booking. Use
                the + button to add a new one.
              </Text>
            </View>
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
          vehiclesQuery.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : vehiclesQuery.error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Couldn't load vehicles.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No vehicles yet.</Text>
              <Text style={styles.emptyHint}>
                Tap + to add your first vehicle.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            onPress={() =>
              navigation.navigate("VehicleDetail", { vehicleId: item.id })
            }
          />
        )}
      />

      {/* Floating action button — drops the operator into the new-vehicle
          form without an existing vehicleId param. */}
      <FAB
        icon="plus"
        style={styles.fab}
        color={colors.onPrimary}
        onPress={() => navigation.navigate("VehicleEdit", {})}
      />
    </View>
  );
}

function VehicleCard({
  vehicle,
  onPress,
}: {
  vehicle: Vehicle;
  onPress: () => void;
}) {
  const cover =
    vehicle.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
    vehicle.cover_photos?.[0]?.cover_photos;

  const isInactive = !vehicle.is_active;
  const isHidden = vehicle.is_public === false;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      <ShimmerImage
        uri={cover}
        style={styles.cardImage}
        fallback={
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Text style={styles.cardImageInitial}>
              {vehicle.title[0] ?? "?"}
            </Text>
          </View>
        }
      />

      {/* Top-right pill cluster — shown only when there's something to flag */}
      {isHidden || isInactive ? (
        <View style={styles.cardOverlayPills}>
          {isInactive ? (
            <View style={[styles.cardOverlayPill, styles.pillInactive]}>
              <Text style={styles.pillInactiveText}>INACTIVE</Text>
            </View>
          ) : null}
          {isHidden ? (
            <View style={[styles.cardOverlayPill, styles.pillHidden]}>
              <Text style={styles.pillHiddenText}>HIDDEN FROM WEBSITE</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {vehicle.title}
          </Text>
          <View style={styles.cardCategory}>
            <Text style={styles.cardCategoryText}>
              {vehicle.category.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {vehicle.vehicle_type}
          {vehicle.number_of_seats ? `  ·  ${vehicle.number_of_seats} seats` : ""}
          {vehicle.registration_number ? `  ·  ${vehicle.registration_number}` : ""}
        </Text>
        <View style={styles.cardFooter}>
          <Text style={styles.cardDriver} numberOfLines={1}>
            {vehicle.driver?.full_name ?? "No driver assigned"}
          </Text>
          <Text style={styles.cardPrice}>R {vehicle.price}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { paddingBottom: 96 }, // leave space for the FAB
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
    paddingBottom: 12,
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
  cardImage: { width: "100%", height: 160, backgroundColor: colors.surfaceMuted },
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
  pillHidden: {
    backgroundColor: "rgba(251,227,227,0.95)",
    borderWidth: 1,
    borderColor: "#e3c1c1",
  },
  pillHiddenText: {
    color: "#b03b3b",
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
  cardMeta: { color: colors.muted, fontSize: 13 },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  cardDriver: { color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 },
  cardPrice: { color: colors.primary, fontSize: 16, fontWeight: "800" },

  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: colors.primary,
  },
});
