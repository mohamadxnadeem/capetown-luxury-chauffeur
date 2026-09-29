import React, { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { Calendar } from "react-native-calendars";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useVilla, useVillaAvailability } from "@/hooks/useVillas";
import type { RootStackParamList } from "@/navigation/types";
import { calendarTheme, colors } from "@/theme";

export default function VillaDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "VillaDetail">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { villaId } = route.params;

  const villaQuery = useVilla(villaId);
  // Only try to fetch Nox availability once the villa is loaded AND has a
  // booking URL on file — otherwise the endpoint returns empty and we can
  // skip the network call entirely.
  const hasNoxUrl = !!villaQuery.data?.nox_booking_url?.trim();
  const availabilityQuery = useVillaAvailability(hasNoxUrl ? villaId : undefined);

  // "Edit" always-reachable action in the stack header — matches how
  // VehicleDetailScreen surfaces its edit affordance.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          compact
          onPress={() => navigation.navigate("VillaEdit", { villaId })}
          textColor={colors.onPrimary}
          labelStyle={{ fontWeight: "700" }}
        >
          Edit
        </Button>
      ),
    });
  }, [navigation, villaId]);

  const markedDates = useMemo(() => {
    const m: Record<
      string,
      {
        disabled?: boolean;
        disableTouchEvent?: boolean;
        customStyles?: { container: object; text: object };
      }
    > = {};
    const partial = [
      ...(availabilityQuery.data?.checkin_only ?? []),
      ...(availabilityQuery.data?.checkout_only ?? []),
    ];
    for (const d of partial) {
      m[d] = {
        customStyles: {
          container: { backgroundColor: colors.partialBg, borderRadius: 8 },
          text: { color: colors.partialText, fontWeight: "600" },
        },
      };
    }
    for (const d of availabilityQuery.data?.unavailable ?? []) {
      m[d] = {
        disabled: true,
        disableTouchEvent: true,
        customStyles: {
          container: { backgroundColor: colors.bookedBg, borderRadius: 8 },
          text: { color: colors.bookedText, fontWeight: "600" },
        },
      };
    }
    return m;
  }, [availabilityQuery.data]);

  if (villaQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (villaQuery.error || !villaQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Couldn't load villa.</Text>
      </View>
    );
  }

  const v = villaQuery.data;
  const photos = v.cover_photos ?? [];

  function bookThisVilla() {
    navigation.navigate("NewBooking", {
      preselectAccommodation: { kind: "villa", id: v.id },
    });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {photos.length > 0 ? (
        <PhotoCarousel photos={photos} height={240} />
      ) : (
        <View style={[styles.hero, styles.heroFallback]}>
          <Text style={styles.heroFallbackText}>{v.name[0] ?? "?"}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{v.name}</Text>
          <View style={styles.pillsCol}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>
                {v.area.replace(/_/g, " ").toUpperCase()}
              </Text>
            </View>
            {!v.is_active ? (
              <View style={styles.hiddenPill}>
                <Text style={styles.hiddenPillText}>HIDDEN</Text>
              </View>
            ) : null}
          </View>
        </View>
        {v.short_description ? (
          <Text style={styles.subtitle}>{v.short_description}</Text>
        ) : null}

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Location</Text>
            <Text style={styles.metaValue}>{v.location || "—"}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Sleeps</Text>
            <Text style={styles.metaValue}>
              {v.bedrooms} bed  ·  {v.bathrooms} bath  ·  {v.max_guests} guests
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Rate</Text>
            <Text style={styles.metaValue}>
              {v.price_currency || "ZAR"} {v.price_per_night} / night
            </Text>
          </View>
        </View>

        <Button
          mode="contained"
          onPress={bookThisVilla}
          style={styles.bookButton}
          contentStyle={styles.bookButtonContent}
          labelStyle={styles.bookButtonLabel}
        >
          Create booking with this villa
        </Button>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AVAILABILITY</Text>
        <Text style={styles.sectionHint}>
          {hasNoxUrl
            ? "Coral = unavailable, amber = check-in / check-out only. Pulled from Nox Rentals."
            : "No Nox booking URL on file. Add one in Edit to see live availability."}
        </Text>
        <View style={styles.calendarShell}>
          <Calendar
            markedDates={markedDates}
            markingType="custom"
            theme={calendarTheme}
            enableSwipeMonths
            // No minDate/maxDate — Nox's max_allowed_date was clamping the
            // header arrows so the operator couldn't page forward. Availability
            // marks stop rendering past the horizon, which is enough.
            onDayPress={() => {}}
          />
        </View>
        {hasNoxUrl && availabilityQuery.isLoading ? (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Loading availability…
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 32 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  muted: { color: colors.muted },

  hero: {
    width: "100%",
    height: 240,
    backgroundColor: colors.surfaceMuted,
  },
  heroFallback: { alignItems: "center", justifyContent: "center" },
  heroFallbackText: { color: colors.primary, fontSize: 72, fontWeight: "800" },

  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    color: colors.heading,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
    flex: 1,
    marginRight: 8,
  },
  pillsCol: { gap: 6, alignItems: "flex-end" },
  categoryPill: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  hiddenPill: {
    backgroundColor: "#fbe3e3",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  hiddenPillText: {
    color: "#b03b3b",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 6 },

  metaCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  metaValue: { color: colors.heading, fontSize: 14, fontWeight: "700", flexShrink: 1, marginLeft: 12, textAlign: "right" },

  bookButton: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  bookButtonContent: { height: 52 },
  bookButtonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },

  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  sectionHint: { color: colors.muted, fontSize: 12, marginBottom: 10 },
  calendarShell: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
