import React, { useState } from "react";
import {
  Alert,
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Menu,
  Text,
} from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAdminBooking, useDriverTrip, useUpdateBooking } from "@/hooks/useBookings";
import { useDrivers } from "@/hooks/useDrivers";
import { useAuthStore } from "@/state/auth";
import type { RootStackParamList } from "@/navigation/types";
import { bookingDateRange, type Booking } from "@/api/types";
import { bookingDetailUrl, driverBookingPageUrl } from "@/api/urls";
import { formatApiError } from "@/api/errors";
import { DayScheduleBar } from "@/components/DayScheduleBar";
import { colors } from "@/theme";

// ---- Helpers ------------------------------------------------------------

function digitsOnly(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D+/g, "");
}

function clientMessage(b: Booking): string {
  const [start, end] = bookingDateRange(b);
  const dateRange = start === end ? start : `${start} → ${end}`;
  return [
    `Hi ${b.customer_name || "there"},`,
    "",
    `Your booking with Cape Town Concierge is confirmed.`,
    "",
    `📅 ${dateRange}`,
    `🚗 ${b.car?.title ?? "Vehicle"}`,
    b.pickup_location ? `📍 Pickup: ${b.pickup_location}` : null,
    b.dropoff_location ? `📍 Dropoff: ${b.dropoff_location}` : null,
    `🎫 Reference: ${b.booking_reference}`,
    "",
    `View full details: ${bookingDetailUrl(b.booking_reference, "client")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function driverMessage(b: Booking): string {
  const [start, end] = bookingDateRange(b);
  const dateRange = start === end ? start : `${start} → ${end}`;
  const firstDay = b.days?.[0];
  const timeLine = firstDay?.start_time
    ? `🕒 ${firstDay.start_time.slice(0, 5)}${
        firstDay.end_time ? ` – ${firstDay.end_time.slice(0, 5)}` : ""
      }`
    : null;
  return [
    `Hi ${b.driver?.full_name || "there"},`,
    "",
    `You've been assigned a new trip with Cape Town Concierge.`,
    "",
    `📅 ${dateRange}`,
    timeLine,
    `🚗 ${b.car?.title ?? "Vehicle"}`,
    `👤 Customer: ${b.customer_name || "—"}`,
    b.customer_phone ? `📞 ${b.customer_phone}` : null,
    b.pickup_location ? `📍 Pickup: ${b.pickup_location}` : null,
    b.dropoff_location ? `📍 Dropoff: ${b.dropoff_location}` : null,
    `🎫 Reference: ${b.booking_reference}`,
    "",
    `View full trip details: ${driverBookingPageUrl(b.booking_reference)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function openWhatsApp(phone: string, message: string) {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      "WhatsApp not available",
      "Make sure WhatsApp is installed on this device."
    );
  }
}

function statusTone(status: string): { bg: string; fg: string } {
  switch (status) {
    case "confirmed":
      return { bg: "rgba(255,255,255,0.92)", fg: colors.primary };
    case "completed":
      return { bg: "rgba(255,255,255,0.92)", fg: colors.muted };
    case "cancelled":
      return { bg: "rgba(255,255,255,0.92)", fg: "#b03b3b" };
    default:
      return { bg: "rgba(255,255,255,0.92)", fg: "#8a6411" };
  }
}

// ---- Main screen --------------------------------------------------------

export default function BookingDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "BookingDetail">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const role = useAuthStore((s) => s.role);
  const { bookingId, bookingRef } = route.params ?? {};

  const adminQuery = useAdminBooking(role === "admin" ? bookingId : undefined);
  const driverQuery = useDriverTrip(
    role === "driver" ? bookingRef : undefined
  );

  const booking: Booking | undefined = adminQuery.data ?? driverQuery.data;
  const isLoading = adminQuery.isLoading || driverQuery.isLoading;
  const error = adminQuery.error ?? driverQuery.error;

  const updateMutation = useUpdateBooking(booking?.id);

  // Admin-only: full driver list for the quick-assign picker.
  const driversQuery = useDrivers();
  const [driverMenuOpen, setDriverMenuOpen] = useState(false);

  async function assignDriver(driverId: number | null) {
    setDriverMenuOpen(false);
    try {
      await updateMutation.mutateAsync({ driver: driverId });
    } catch (err: unknown) {
      Alert.alert("Couldn't assign driver", formatApiError(err));
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !booking) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Couldn't load booking.</Text>
      </View>
    );
  }

  const isAdmin = role === "admin";
  const cover =
    booking.car?.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
    booking.car?.cover_photos?.[0]?.cover_photos;
  const [firstDay, lastDay] = bookingDateRange(booking);
  const dateRangeLabel = firstDay === lastDay ? firstDay : `${firstDay} → ${lastDay}`;
  const total = booking.total_client_amount ?? booking.total_driver_amount;
  const days = booking.days ?? [];
  const isCancelled = booking.status === "cancelled";

  const clientDigits = digitsOnly(booking.customer_phone);
  const driverDigits = digitsOnly(
    booking.driver?.whatsapp ?? booking.driver?.phone
  );

  function confirmCancel() {
    Alert.alert(
      "Cancel this booking?",
      `${booking?.booking_reference} will be marked as cancelled. The vehicle becomes available for those dates again.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel booking",
          style: "destructive",
          onPress: async () => {
            try {
              await updateMutation.mutateAsync({ status: "cancelled" });
            } catch (err: unknown) {
              Alert.alert("Couldn't cancel", formatApiError(err));
            }
          },
        },
      ]
    );
  }

  async function changeStatus(status: "pending" | "confirmed" | "completed") {
    try {
      await updateMutation.mutateAsync({ status });
    } catch (err: unknown) {
      Alert.alert("Couldn't update status", formatApiError(err));
    }
  }

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
      >
        {/* Hero with cover photo + booking ref + status */}
        <Hero
          cover={cover}
          bookingRef={booking.booking_reference}
          vehicleTitle={booking.car?.title ?? "Vehicle"}
          status={booking.status}
          dateRangeLabel={dateRangeLabel}
        />

        {/* WhatsApp actions — admin only. Driver button only when a driver
            with a WhatsApp number is assigned; sends a different message that
            includes a link to the driver-facing booking page. */}
        {isAdmin && !isCancelled && (clientDigits || driverDigits) ? (
          <View style={styles.actionsRow}>
            {clientDigits ? (
              <ActionButton
                icon="whatsapp"
                label="Send to client"
                onPress={() =>
                  openWhatsApp(clientDigits, clientMessage(booking))
                }
              />
            ) : null}
            {driverDigits ? (
              <ActionButton
                icon="whatsapp"
                label="Send to driver"
                onPress={() =>
                  openWhatsApp(driverDigits, driverMessage(booking))
                }
              />
            ) : null}
          </View>
        ) : null}

        {/* Booking info */}
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <SectionLabel>Customer</SectionLabel>
            <Row label="Name" value={booking.customer_name} />
            <Row label="Phone" value={booking.customer_phone} />
            <Row label="Email" value={booking.customer_email} />

            <Divider style={styles.divider} />

            <SectionLabel>Trip</SectionLabel>
            <Row label="Vehicle" value={booking.car?.title} />
            {isAdmin && !isCancelled ? (
              <View style={styles.driverPickerRow}>
                <Text style={styles.rowLabel}>Driver</Text>
                <View style={styles.driverPickerAnchor}>
                  <Menu
                    visible={driverMenuOpen}
                    onDismiss={() => setDriverMenuOpen(false)}
                    anchor={
                      <TouchableOpacity
                        onPress={() => setDriverMenuOpen(true)}
                        activeOpacity={0.85}
                        style={styles.driverPickerButton}
                      >
                        <Text
                          style={[
                            styles.driverPickerText,
                            !booking.driver && styles.driverPickerTextMuted,
                          ]}
                        >
                          {booking.driver?.full_name ?? "Tap to assign…"}
                        </Text>
                        <Text style={styles.driverPickerChevron}>▾</Text>
                      </TouchableOpacity>
                    }
                  >
                    <Menu.Item
                      onPress={() => assignDriver(null)}
                      title="No driver"
                      leadingIcon={!booking.driver ? "check" : undefined}
                    />
                    {(driversQuery.data ?? [])
                      .filter((d) => d.is_active)
                      .map((d) => (
                        <Menu.Item
                          key={d.id}
                          onPress={() => assignDriver(d.id)}
                          title={d.full_name}
                          leadingIcon={
                            booking.driver?.id === d.id ? "check" : undefined
                          }
                        />
                      ))}
                    <Divider />
                    <Menu.Item
                      onPress={() => {
                        setDriverMenuOpen(false);
                        navigation.navigate("DriverList");
                      }}
                      title="Add new driver…"
                      leadingIcon="plus"
                    />
                  </Menu>
                </View>
              </View>
            ) : (
              <Row
                label="Driver"
                value={booking.driver?.full_name ?? "Unassigned"}
              />
            )}
            <Row label="Pickup" value={booking.pickup_location} />
            <Row label="Dropoff" value={booking.dropoff_location} />
            <Row label="Description" value={booking.trip_description} />

            <Divider style={styles.divider} />

            <SectionLabel>Pricing</SectionLabel>
            <Row label="Days" value={booking.total_days || days.length} />
            <Row label="Total" value={total ? `R ${total}` : null} bold />
          </Card.Content>
        </Card>

        {days.length > 0 ? (
          <Card style={styles.card} mode="elevated">
            <Card.Content>
              <SectionLabel>Schedule</SectionLabel>
              {days.map((d, i) => (
                <View
                  key={d.id}
                  style={[styles.dayBlock, i === 0 && styles.dayBlockFirst]}
                >
                  <View style={styles.dayBlockHeader}>
                    <View style={styles.dayBullet}>
                      <Text style={styles.dayBulletText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.dayDate}>{d.date}</Text>
                  </View>
                  <DayScheduleBar
                    startTime={d.start_time}
                    endTime={d.end_time}
                  />
                  {d.notes ? (
                    <Text style={styles.dayNote}>{d.notes}</Text>
                  ) : null}
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : null}

        {/* Manage booking — admin only, hidden for cancelled */}
        {isAdmin && !isCancelled ? (
          <Card style={styles.card} mode="elevated">
            <Card.Content>
              <SectionLabel>Status</SectionLabel>
              <View style={styles.statusRow}>
                {(["pending", "confirmed", "completed"] as const).map((s) => {
                  const active = booking.status === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      onPress={() => (active ? undefined : changeStatus(s))}
                      disabled={updateMutation.isPending}
                      activeOpacity={0.85}
                      style={[
                        styles.statusChip,
                        active && styles.statusChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          active && styles.statusChipTextActive,
                        ]}
                      >
                        {s[0].toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <SectionLabel>Manage booking</SectionLabel>
              <Button
                mode="outlined"
                onPress={() =>
                  navigation.navigate("BookingEdit", { bookingId: booking.id })
                }
                style={styles.manageButton}
                contentStyle={styles.manageButtonContent}
                labelStyle={styles.manageLabel}
                textColor={colors.primary}
                icon="pencil"
              >
                Edit booking
              </Button>
              <Button
                mode="outlined"
                onPress={confirmCancel}
                loading={updateMutation.isPending}
                disabled={updateMutation.isPending}
                style={[styles.manageButton, styles.dangerButton]}
                contentStyle={styles.manageButtonContent}
                labelStyle={styles.manageLabel}
                textColor="#b03b3b"
                icon="close-circle-outline"
              >
                Cancel booking
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        {isCancelled ? (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledText}>This booking is cancelled.</Text>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

// ---- Sub-components -----------------------------------------------------

function Hero({
  cover,
  bookingRef,
  vehicleTitle,
  status,
  dateRangeLabel,
}: {
  cover?: string;
  bookingRef: string;
  vehicleTitle: string;
  status: string;
  dateRangeLabel: string;
}) {
  const tone = statusTone(status);
  const heroChildren = (
    <>
      <LinearGradient
        colors={["rgba(11,91,51,0.05)", "rgba(10,26,16,0.85)"]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.heroContent}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>{bookingRef}</Text>
          <View style={[styles.heroStatus, { backgroundColor: tone.bg }]}>
            <Text style={[styles.heroStatusText, { color: tone.fg }]}>
              {status.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>{vehicleTitle}</Text>
        {dateRangeLabel ? (
          <Text style={styles.heroDates}>{dateRangeLabel}</Text>
        ) : null}
      </View>
    </>
  );

  if (cover) {
    return (
      <ImageBackground source={{ uri: cover }} style={styles.hero}>
        {heroChildren}
      </ImageBackground>
    );
  }
  // Fallback: solid emerald background when no photo is available.
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      {heroChildren}
    </LinearGradient>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Button
      mode="contained"
      buttonColor={colors.primary}
      textColor={colors.onPrimary}
      style={styles.actionButton}
      contentStyle={styles.actionContent}
      labelStyle={styles.actionLabel}
      icon={icon}
      onPress={onPress}
    >
      {label}
    </Button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value?: string | number | null;
  bold?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowValueBold]}>
        {String(value)}
      </Text>
    </View>
  );
}

// ---- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: 32 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },

  // Hero
  hero: {
    height: 240,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroContent: { padding: 20 },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  heroStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroStatusText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heroTitle: {
    color: colors.onPrimary,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  heroDates: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },

  // Action row
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  actionButton: { flex: 1, borderRadius: 14 },
  actionContent: { height: 48 },
  actionLabel: { fontWeight: "700", fontSize: 13 },

  // Cards
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 8,
    marginTop: 4,
  },
  divider: { backgroundColor: colors.border, marginVertical: 14 },

  row: { flexDirection: "row", marginVertical: 3 },
  rowLabel: {
    width: 96,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  rowValue: { flex: 1, color: colors.text, fontSize: 14 },
  rowValueBold: { color: colors.primary, fontWeight: "800" },

  driverPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  driverPickerAnchor: { flex: 1 },
  driverPickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  driverPickerText: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  driverPickerTextMuted: { color: colors.muted, fontWeight: "500" },
  driverPickerChevron: { color: colors.muted, fontSize: 12, marginLeft: 8 },

  // Day schedule blocks
  dayBlock: {
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayBlockFirst: { paddingTop: 0, marginTop: 4, borderTopWidth: 0 },
  dayBlockHeader: { flexDirection: "row", alignItems: "center" },
  dayBullet: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dayBulletText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  dayDate: { color: colors.heading, fontWeight: "700", fontSize: 15 },
  dayNote: { color: colors.text, fontSize: 13, marginTop: 8, fontStyle: "italic" },

  // Status switcher
  statusRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  statusChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  statusChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusChipText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
  },
  statusChipTextActive: { color: colors.onPrimary },

  // Manage
  manageButton: {
    marginTop: 10,
    borderRadius: 12,
    borderColor: colors.primary,
  },
  manageButtonContent: { height: 48 },
  manageLabel: { fontWeight: "700", letterSpacing: 0.3 },
  dangerButton: { borderColor: "#e3c1c1", backgroundColor: "#fbf2f2" },

  cancelledBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#fbf2f2",
    borderWidth: 1,
    borderColor: "#e3c1c1",
    alignItems: "center",
  },
  cancelledText: { color: "#b03b3b", fontWeight: "700" },
});
