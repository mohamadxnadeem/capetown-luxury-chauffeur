import React, { useEffect, useMemo } from "react";
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import {
  ActivityIndicator,
  Button,
  Snackbar,
  Text,
} from "react-native-paper";
import { Calendar, DateData } from "react-native-calendars";
import * as Clipboard from "expo-clipboard";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useRotateCalendarToken,
  useVehicle,
} from "@/hooks/useVehicles";
import {
  useAdminBookings,
  useVehicleBookedSlots,
  useVehicleUnavailableDates,
} from "@/hooks/useBookings";
import type { BookedSlot } from "@/api/bookings";
import { apiBaseUrl } from "@/api/client";
import type { RootStackParamList } from "@/navigation/types";
import { DayBookingsTimeline } from "@/components/DayBookingsTimeline";
import { calendarTheme, colors } from "@/theme";

export default function VehicleDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "VehicleDetail">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { vehicleId } = route.params;

  const vehicleQuery = useVehicle(vehicleId);
  const unavailableQuery = useVehicleUnavailableDates(vehicleId);
  const bookedSlotsQuery = useVehicleBookedSlots(vehicleId);
  const bookingsQuery = useAdminBookings({ car: vehicleId });
  const rotateMutation = useRotateCalendarToken(vehicleId);

  // Snackbar to confirm "copied!" without an intrusive alert.
  const [copiedMessage, setCopiedMessage] = React.useState<string | null>(null);
  // The date tapped on the calendar — drives the day-bookings timeline.
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  // booking_reference → booking id, so a tapped timeline segment can open
  // the admin booking detail (which is keyed by id, not reference).
  const refToId = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookingsQuery.data ?? []) {
      m.set(b.booking_reference, b.id);
    }
    return m;
  }, [bookingsQuery.data]);

  // Booked slots for the currently selected date.
  const selectedDaySlots = useMemo<BookedSlot[]>(() => {
    if (!selectedDate) return [];
    return (bookedSlotsQuery.data ?? []).filter(
      (s) => s.date === selectedDate
    );
  }, [bookedSlotsQuery.data, selectedDate]);

  function openSlot(slot: BookedSlot) {
    const id = refToId.get(slot.booking_reference);
    if (id != null) {
      navigation.navigate("BookingDetail", { bookingId: id });
    } else {
      // Fall back to a reference-based open if we couldn't map it.
      navigation.navigate("BookingDetail", {
        bookingRef: slot.booking_reference,
      });
    }
  }

  // Surface an "Edit" action in the stack header so it's always reachable.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          compact
          onPress={() => navigation.navigate("VehicleEdit", { vehicleId })}
          textColor={colors.onPrimary}
          labelStyle={{ fontWeight: "700" }}
        >
          Edit
        </Button>
      ),
    });
  }, [navigation, vehicleId]);

  const markedDates = useMemo(() => {
    const m: Record<
      string,
      { customStyles?: { container: object; text: object } }
    > = {};
    // This calendar is a read-only inspector — every date stays tappable so
    // the operator can open any day's bookings. Colour only conveys load:
    // amber = partly booked, coral = fully booked.
    for (const d of unavailableQuery.data?.partiallyBooked ?? []) {
      m[d] = {
        customStyles: {
          container: { backgroundColor: colors.partialBg, borderRadius: 8 },
          text: { color: colors.partialText, fontWeight: "600" },
        },
      };
    }
    for (const d of unavailableQuery.data?.unavailable ?? []) {
      m[d] = {
        customStyles: {
          container: { backgroundColor: colors.bookedBg, borderRadius: 8 },
          text: { color: colors.bookedText, fontWeight: "600" },
        },
      };
    }
    // The tapped date wins — emerald selection.
    if (selectedDate) {
      m[selectedDate] = {
        customStyles: {
          container: { backgroundColor: colors.primary, borderRadius: 8 },
          text: { color: colors.onPrimary, fontWeight: "700" },
        },
      };
    }
    return m;
  }, [unavailableQuery.data, selectedDate]);

  if (vehicleQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (vehicleQuery.error || !vehicleQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Couldn't load vehicle.</Text>
      </View>
    );
  }

  const v = vehicleQuery.data;
  const photos = v.cover_photos ?? [];

  function bookThisVehicle() {
    // Jump to the New tab with vehicleId pre-selected. The tab screen reads
    // route.params and pre-populates its form.
    navigation.navigate("Tabs", {
      screen: "New",
      params: { vehicleId: v.id },
    } as never);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {photos.length > 0 ? (
        <PhotoCarousel photos={photos} height={240} />
      ) : (
        <View style={[styles.hero, styles.heroFallback]}>
          <Text style={styles.heroFallbackText}>{v.title[0] ?? "?"}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{v.title}</Text>
          <View style={styles.pillsCol}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{v.category.toUpperCase()}</Text>
            </View>
            {v.is_public === false ? (
              <View style={styles.hiddenPill}>
                <Text style={styles.hiddenPillText}>HIDDEN</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={styles.subtitle}>
          {v.vehicle_type}
          {v.number_of_seats ? `  ·  ${v.number_of_seats} seats` : ""}
          {v.registration_number ? `  ·  ${v.registration_number}` : ""}
        </Text>

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Driver</Text>
            <Text style={styles.metaValue}>
              {v.driver?.full_name ?? "No driver assigned"}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Daily rate</Text>
            <Text style={styles.metaValue}>R {v.price}</Text>
          </View>
          {v.driver?.default_daily_rate ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Driver rate</Text>
              <Text style={styles.metaValue}>
                R {v.driver.default_daily_rate}
              </Text>
            </View>
          ) : null}
        </View>

        <Button
          mode="contained"
          onPress={bookThisVehicle}
          style={styles.bookButton}
          contentStyle={styles.bookButtonContent}
          labelStyle={styles.bookButtonLabel}
        >
          Book this vehicle
        </Button>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AVAILABILITY</Text>
        <Text style={styles.sectionHint}>
          Amber = partly booked, coral = fully booked. Tap any date to see
          that day's bookings.
        </Text>
        <View style={styles.calendarShell}>
          <Calendar
            markedDates={markedDates}
            markingType="custom"
            theme={calendarTheme}
            enableSwipeMonths
            onDayPress={(d: DateData) => setSelectedDate(d.dateString)}
          />
        </View>
        {unavailableQuery.isLoading ? (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Loading availability…
          </Text>
        ) : null}

        {selectedDate ? (
          <View style={styles.timelineWrap}>
            <DayBookingsTimeline
              date={selectedDate}
              slots={selectedDaySlots}
              onSlotPress={openSlot}
            />
          </View>
        ) : null}
      </View>

      {/* Calendar feed (public, token-gated). Share these URLs with partners
          who want to subscribe to this vehicle's bookings without an
          account. Rotate the token if a URL ever leaks. */}
      <CalendarFeedSection
        token={v.calendar_token}
        rotating={rotateMutation.isPending}
        onCopy={async (label, url) => {
          await Clipboard.setStringAsync(url);
          setCopiedMessage(`${label} URL copied`);
        }}
        onRotate={() => {
          Alert.alert(
            "Rotate calendar token?",
            "The current calendar URLs will stop working immediately. Anyone subscribed (Google Calendar, partner apps) will need the new URL.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Rotate",
                style: "destructive",
                onPress: async () => {
                  try {
                    await rotateMutation.mutateAsync();
                    setCopiedMessage("Token rotated — old URLs stopped working");
                  } catch (err: unknown) {
                    const resp = (err as { response?: { data?: unknown } })
                      ?.response?.data;
                    const message =
                      typeof resp === "string"
                        ? resp
                        : (err as Error)?.message ?? "Unknown error";
                    Alert.alert("Couldn't rotate", message);
                  }
                },
              },
            ]
          );
        }}
      />

      <Snackbar
        visible={copiedMessage !== null}
        onDismiss={() => setCopiedMessage(null)}
        duration={2000}
        style={styles.snackbar}
      >
        {copiedMessage}
      </Snackbar>
    </ScrollView>
  );
}

// ---- Calendar-feed sub-component --------------------------------------

function CalendarFeedSection({
  token,
  rotating,
  onCopy,
  onRotate,
}: {
  token: string | undefined;
  rotating: boolean;
  onCopy: (label: string, url: string) => void;
  onRotate: () => void;
}) {
  if (!token) {
    // Older backend versions may not expose the token. Skip the section
    // silently rather than confusing the operator with an empty card.
    return null;
  }
  const jsonUrl = `${apiBaseUrl}/api/calendar/${token}/bookings.json`;
  const icsUrl = `${apiBaseUrl}/api/calendar/${token}/bookings.ics`;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>CALENDAR FEED</Text>
      <Text style={styles.sectionHint}>
        Share these URLs with partners who want to subscribe to this
        vehicle's bookings. Anyone with the URL can read it — rotate the
        token if a link leaks.
      </Text>

      <CalendarFeedRow
        label="iCal (Google / Apple Calendar)"
        url={icsUrl}
        onPress={() => onCopy("iCal", icsUrl)}
      />
      <CalendarFeedRow
        label="JSON (custom integrations)"
        url={jsonUrl}
        onPress={() => onCopy("JSON", jsonUrl)}
      />

      <Button
        mode="outlined"
        onPress={onRotate}
        loading={rotating}
        disabled={rotating}
        style={styles.rotateButton}
        contentStyle={styles.rotateButtonContent}
        labelStyle={styles.rotateButtonLabel}
        textColor="#b03b3b"
        icon="autorenew"
      >
        Rotate token
      </Button>
    </View>
  );
}

function CalendarFeedRow({
  label,
  url,
  onPress,
}: {
  label: string;
  url: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.feedRow}
    >
      <View style={styles.feedRowText}>
        <Text style={styles.feedRowLabel}>{label}</Text>
        <Text style={styles.feedRowUrl} numberOfLines={1}>
          {url}
        </Text>
      </View>
      <Text style={styles.feedRowCopy}>COPY</Text>
    </TouchableOpacity>
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
  heroFallbackText: { fontSize: 72, fontWeight: "800", color: colors.primary },
  section: { padding: 16 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: colors.heading,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    flex: 1,
    marginRight: 8,
  },
  pillsCol: { alignItems: "flex-end", gap: 6 },
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
    letterSpacing: 1.2,
  },
  hiddenPill: {
    backgroundColor: "#fbe3e3",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e3c1c1",
  },
  hiddenPillText: {
    color: "#b03b3b",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 4 },
  metaCard: {
    marginTop: 16,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  metaLabel: { color: colors.muted, fontWeight: "600" },
  metaValue: { color: colors.text, fontWeight: "700" },
  bookButton: { marginTop: 16, borderRadius: 14 },
  bookButtonContent: { height: 52 },
  bookButtonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  sectionHint: { color: colors.muted, fontSize: 13, marginBottom: 12 },
  calendarShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  timelineWrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  // Calendar feed
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 10,
  },
  feedRowText: { flex: 1, marginRight: 12 },
  feedRowLabel: {
    color: colors.heading,
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 2,
  },
  feedRowUrl: { color: colors.muted, fontSize: 11 },
  feedRowCopy: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1.2,
  },

  rotateButton: {
    marginTop: 6,
    borderRadius: 12,
    borderColor: "#e3c1c1",
    backgroundColor: "#fbf2f2",
  },
  rotateButtonContent: { height: 44 },
  rotateButtonLabel: { fontWeight: "700", letterSpacing: 0.3, fontSize: 13 },

  snackbar: {
    backgroundColor: colors.heading,
  },
});
