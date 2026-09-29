import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHotel } from "@/hooks/useHotels";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

export default function HotelDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "HotelDetail">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { hotelId } = route.params;

  const hotelQuery = useHotel(hotelId);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          compact
          onPress={() => navigation.navigate("HotelEdit", { hotelId })}
          textColor={colors.onPrimary}
          labelStyle={{ fontWeight: "700" }}
        >
          Edit
        </Button>
      ),
    });
  }, [navigation, hotelId]);

  if (hotelQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (hotelQuery.error || !hotelQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Couldn't load hotel.</Text>
      </View>
    );
  }

  const h = hotelQuery.data;
  const photos = h.cover_photos ?? [];
  const stars =
    "★".repeat(h.star_rating || 0) + "☆".repeat(Math.max(0, 5 - (h.star_rating || 0)));

  function bookThisHotel() {
    navigation.navigate("NewBooking", {
      preselectAccommodation: { kind: "hotel", id: h.id },
    });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {photos.length > 0 ? (
        <PhotoCarousel photos={photos} height={240} />
      ) : (
        <View style={[styles.hero, styles.heroFallback]}>
          <Text style={styles.heroFallbackText}>{h.name[0] ?? "?"}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{h.name}</Text>
          <View style={styles.pillsCol}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>
                {h.area.replace(/_/g, " ").toUpperCase()}
              </Text>
            </View>
            {!h.is_active ? (
              <View style={styles.hiddenPill}>
                <Text style={styles.hiddenPillText}>HIDDEN</Text>
              </View>
            ) : null}
          </View>
        </View>
        {h.star_rating ? <Text style={styles.stars}>{stars}</Text> : null}
        {h.short_description ? (
          <Text style={styles.subtitle}>{h.short_description}</Text>
        ) : null}

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Location</Text>
            <Text style={styles.metaValue}>{h.location || "—"}</Text>
          </View>
          {h.bedrooms_available || h.max_guests ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Capacity</Text>
              <Text style={styles.metaValue}>
                {h.bedrooms_available ? `${h.bedrooms_available} rooms` : ""}
                {h.bedrooms_available && h.max_guests ? "  ·  " : ""}
                {h.max_guests ? `sleeps ${h.max_guests}` : ""}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Rate</Text>
            <Text style={styles.metaValue}>
              from {h.price_currency || "ZAR"} {h.price_per_night_from} / night
            </Text>
          </View>
        </View>

        {h.room_types?.length ? (
          <View style={styles.roomTypesWrap}>
            <Text style={styles.sectionLabel}>ROOM TYPES</Text>
            <View style={styles.roomTypesRow}>
              {h.room_types.map((rt) => (
                <View key={rt} style={styles.roomTypeChip}>
                  <Text style={styles.roomTypeText}>{rt}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Button
          mode="contained"
          onPress={bookThisHotel}
          style={styles.bookButton}
          contentStyle={styles.bookButtonContent}
          labelStyle={styles.bookButtonLabel}
        >
          Create booking with this hotel
        </Button>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AVAILABILITY</Text>
        <Text style={styles.sectionHint}>
          Live hotel availability isn't wired up yet — check with the hotel
          directly before confirming a stay.
        </Text>
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

  hero: { width: "100%", height: 240, backgroundColor: colors.surfaceMuted },
  heroFallback: { alignItems: "center", justifyContent: "center" },
  heroFallbackText: { color: colors.primary, fontSize: 72, fontWeight: "800" },

  section: { paddingHorizontal: 20, paddingTop: 20 },
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
  stars: { color: "#c98c1a", fontSize: 15, letterSpacing: 1.5, marginTop: 4 },
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
  metaValue: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
    marginLeft: 12,
    textAlign: "right",
  },

  roomTypesWrap: { marginTop: 16 },
  roomTypesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  roomTypeChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  roomTypeText: { color: colors.text, fontSize: 12, fontWeight: "600" },

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
  sectionHint: { color: colors.muted, fontSize: 12 },
});
