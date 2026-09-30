import React, { useMemo, useState } from "react";
import {
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
  TextInput,
} from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminBooking,
  useBookingFormOptions,
  useDriverTrip,
  useUpdateBooking,
} from "@/hooks/useBookings";
import { useConvertBookingToGroup } from "@/hooks/useBookingGroups";
import { useDrivers } from "@/hooks/useDrivers";
import { useAuthStore } from "@/state/auth";
import type { RootStackParamList } from "@/navigation/types";
import {
  bookingDateRange,
  type AccommodationSegment,
  type Booking,
  type CreateBookingDayPayload,
  type DriverNested,
  type Vehicle,
} from "@/api/types";
import type { CreateBookingGroupChildPayload } from "@/api/bookingGroups";
import { ShimmerImage } from "@/components/ShimmerImage";
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

// Google review link for Cape Town Concierge — used in both the client and
// driver review-request templates. If this ever changes, update it here.
const REVIEW_URL = "https://g.page/r/CdDvksuxeMPLEBM/review";

function paymentMessage(b: Booking): string {
  const total = b.total_client_amount ? `R ${b.total_client_amount}` : null;
  return [
    `Hi ${b.customer_name || "there"},`,
    "",
    `Here's your payment link for booking ${b.booking_reference} with Cape Town Concierge.`,
    "",
    total ? `💳 Amount due: ${total}` : null,
    `🔗 Pay securely: ${b.payment_link}`,
    "",
    `Once payment is received your booking is fully confirmed. Thank you!`,
  ]
    .filter(Boolean)
    .join("\n");
}

function reviewClientMessage(b: Booking): string {
  return [
    `Hi ${b.customer_name || "there"},`,
    "",
    `Thank you for choosing Cape Town Concierge — it was a pleasure having you.`,
    "",
    `If you have a moment, we'd really appreciate a quick Google review:`,
    REVIEW_URL,
    "",
    `Looking forward to driving you again!`,
  ].join("\n");
}

function reviewDriverMessage(b: Booking): string {
  return [
    `Hi ${b.driver?.full_name || "there"},`,
    "",
    `When you drop ${b.customer_name || "the client"} (booking ${b.booking_reference}), please share this Google review link with them:`,
    "",
    REVIEW_URL,
    "",
    `A short personal ask at the end of the trip makes a big difference. Thanks!`,
  ].join("\n");
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
  const convertMutation = useConvertBookingToGroup(booking?.id);
  const queryClient = useQueryClient();

  // Admin-only: full driver list for the quick-assign picker.
  const driversQuery = useDrivers();
  const [driverMenuOpen, setDriverMenuOpen] = useState(false);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const formOptionsQuery = useBookingFormOptions();

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

  function confirmMarkPaid() {
    if (!booking) return;
    const bookingId = booking.id;
    Alert.alert(
      "Mark as paid?",
      "Use this when the client paid outside Yoco (cash, EFT, another gateway). This won't create a Yoco receipt.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark paid",
          onPress: async () => {
            // Snapshot the current booking so we can roll back on failure.
            const detailKey = ["admin", "booking", bookingId];
            const previous = queryClient.getQueryData<Booking>(detailKey);

            // Optimistically flip is_paid so the ✓ PAID pill + payment
            // buttons update instantly; backend auto-stamps paid_at on save.
            queryClient.setQueryData<Booking | undefined>(detailKey, (b) =>
              b ? { ...b, is_paid: true } : b
            );

            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await updateMutation.mutateAsync({ is_paid: true } as any);
            } catch (err: unknown) {
              // Rollback — restore the previous cached booking so the pill
              // reverts before we show the error alert.
              queryClient.setQueryData(detailKey, previous);
              Alert.alert("Couldn't mark as paid", formatApiError(err));
            }
          },
        },
      ]
    );
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

        {/* Warn the operator when a booking has no reference — sharing links
            without one would produce a broken /booking// URL. Root cause is
            usually a backend serializer that didn't generate a reference for
            an accommodation-only booking. */}
        {isAdmin && !booking.booking_reference ? (
          <View style={styles.noRefBanner}>
            <Text style={styles.noRefBannerText}>
              This booking is missing a reference. Client/driver share links
              are disabled until the backend generates one.
            </Text>
          </View>
        ) : null}

        {/* Group chip: this booking is part of a multi-vehicle proposal.
            Tap to jump to the group where the combined total and single
            client payment link live. */}
        {isAdmin && booking.group_id && booking.group_reference ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              navigation.navigate("BookingGroupDetail", {
                groupId: booking.group_id!,
              })
            }
            style={styles.groupChip}
          >
            <Text style={styles.groupChipIcon}>↔</Text>
            <View style={styles.groupChipBody}>
              <Text style={styles.groupChipTitle}>Part of a group proposal</Text>
              <Text style={styles.groupChipRef}>
                {booking.group_reference}
              </Text>
            </View>
            <Text style={styles.groupChipChevron}>›</Text>
          </TouchableOpacity>
        ) : null}

        {/* WhatsApp actions — admin only. All gated on booking.booking_reference
            since every template embeds it in the message + shareable URL. */}
        {isAdmin &&
        !isCancelled &&
        booking.booking_reference &&
        (clientDigits || driverDigits) ? (
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
            {/* Payment link only renders when the backend has created the Yoco
                link AND the booking hasn't been paid yet. */}
            {clientDigits && booking.payment_link && !booking.is_paid ? (
              <ActionButton
                icon="credit-card-outline"
                label="Send payment link"
                onPress={() =>
                  openWhatsApp(clientDigits, paymentMessage(booking))
                }
              />
            ) : null}
            {clientDigits ? (
              <ActionButton
                icon="star-outline"
                label="Request review"
                onPress={() =>
                  openWhatsApp(clientDigits, reviewClientMessage(booking))
                }
              />
            ) : null}
            {driverDigits ? (
              <ActionButton
                icon="star-outline"
                label="Review link to driver"
                onPress={() =>
                  openWhatsApp(driverDigits, reviewDriverMessage(booking))
                }
              />
            ) : null}
          </View>
        ) : null}

        {/* Paid pill — replaces the payment link button once Yoco webhook
            flips is_paid. */}
        {isAdmin && booking.is_paid ? (
          <View style={styles.paidPillWrap}>
            <View style={styles.paidPill}>
              <Text style={styles.paidPillText}>✓ PAID</Text>
            </View>
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

        {/* Bundle add-ons — only renders if the operator attached any. */}
        {(booking.accommodation_segments &&
          booking.accommodation_segments.length > 0) ||
        booking.villa ||
        (booking.experiences && booking.experiences.length > 0) ||
        (booking.included_packages && booking.included_packages.length > 0) ? (
          <Card style={styles.card} mode="elevated">
            <Card.Content>
              <SectionLabel>Bundle</SectionLabel>

              {/* Accommodation segments — new shape. If missing, fall back
                  to the legacy single `villa` FK for pre-migration bookings. */}
              {booking.accommodation_segments &&
              booking.accommodation_segments.length > 0
                ? booking.accommodation_segments.map((s) => (
                    <AccommodationSegmentRow key={s.id ?? `${s.start_date}-${s.end_date}`} segment={s} />
                  ))
                : booking.villa
                  ? (
                      <View style={styles.bundleItem}>
                        <Text style={styles.bundleKind}>VILLA</Text>
                        <Text style={styles.bundleTitle}>
                          {booking.villa.name}
                        </Text>
                        {booking.villa.location ? (
                          <Text style={styles.bundleSub}>
                            {booking.villa.location}
                            {booking.villa.price_per_night
                              ? `  ·  ${booking.villa.price_currency || "ZAR"} ${booking.villa.price_per_night} / night`
                              : ""}
                          </Text>
                        ) : null}
                      </View>
                    )
                  : null}

              {(booking.experiences ?? []).map((e) => (
                <View key={e.id} style={styles.bundleItem}>
                  <Text style={styles.bundleKind}>EXPERIENCE</Text>
                  <Text style={styles.bundleTitle}>{e.title}</Text>
                  {e.duration || e.price_from ? (
                    <Text style={styles.bundleSub}>
                      {e.duration}
                      {e.duration && e.price_from ? "  ·  " : ""}
                      {e.price_from
                        ? `from ${e.currency || "ZAR"} ${e.price_from}`
                        : ""}
                    </Text>
                  ) : null}
                </View>
              ))}
              {(booking.included_packages ?? []).map((p) => (
                <View key={p.id} style={styles.bundleItem}>
                  <Text style={styles.bundleKind}>PACKAGE</Text>
                  <Text style={styles.bundleTitle}>{p.name}</Text>
                  {p.tagline || p.price_from ? (
                    <Text style={styles.bundleSub}>
                      {p.tagline}
                      {p.tagline && p.price_from ? "  ·  " : ""}
                      {p.price_from
                        ? `from ${p.price_currency || "ZAR"} ${p.price_from}`
                        : ""}
                    </Text>
                  ) : null}
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : null}

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
              {!booking.is_paid ? (
                <Button
                  mode="outlined"
                  onPress={confirmMarkPaid}
                  loading={updateMutation.isPending}
                  disabled={updateMutation.isPending}
                  style={styles.manageButton}
                  contentStyle={styles.manageButtonContent}
                  labelStyle={styles.manageLabel}
                  textColor={colors.primary}
                  icon="check-circle-outline"
                >
                  Mark as paid
                </Button>
              ) : null}
              {/* Standalone booking → offer to promote it to a group so
                  the operator can attach a second vehicle. Hidden when
                  the booking is already grouped. */}
              {!booking.group_id ? (
                <Button
                  mode="outlined"
                  onPress={() => setAddVehicleOpen(true)}
                  disabled={convertMutation.isPending}
                  style={styles.manageButton}
                  contentStyle={styles.manageButtonContent}
                  labelStyle={styles.manageLabel}
                  textColor={colors.primary}
                  icon="plus"
                >
                  Add another vehicle
                </Button>
              ) : null}
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

      {/* Add-another-vehicle sheet — promotes this standalone booking
          into a new BookingGroup with the picked vehicle as sibling. */}
      <AddVehicleSheet
        visible={addVehicleOpen}
        onClose={() => setAddVehicleOpen(false)}
        primaryBooking={booking}
        vehicles={formOptionsQuery.data?.vehicles ?? []}
        drivers={formOptionsQuery.data?.drivers ?? []}
        submitting={convertMutation.isPending}
        onSubmit={async (child) => {
          try {
            const group = await convertMutation.mutateAsync({
              additional_bookings: [child],
            });
            setAddVehicleOpen(false);
            // Replace so back doesn't return to a booking that's now
            // just one child of a group — the group is the new source
            // of truth for this proposal.
            navigation.replace("BookingGroupDetail", { groupId: group.id });
          } catch (err: unknown) {
            // Backend returns 400 with a helpful message when the
            // booking is already grouped. Surface it directly.
            Alert.alert("Couldn't add vehicle", formatApiError(err));
          }
        }}
      />
    </>
  );
}

// ---- Add-vehicle sheet --------------------------------------------------

// A bottom-sheet-style modal that lets the operator pick a second vehicle
// and a per-day rate; dates and times are inherited from the primary
// booking so the operator doesn't need to redo the schedule.
function AddVehicleSheet({
  visible,
  onClose,
  primaryBooking,
  vehicles,
  drivers,
  submitting,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  primaryBooking: Booking;
  vehicles: Vehicle[];
  drivers: DriverNested[];
  submitting: boolean;
  onSubmit: (child: CreateBookingGroupChildPayload) => Promise<void>;
}) {
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [clientRate, setClientRate] = useState("");
  const [driverRate, setDriverRate] = useState("");
  const [pickupOverride, setPickupOverride] = useState("");
  const [dropoffOverride, setDropoffOverride] = useState("");
  const [notesOverride, setNotesOverride] = useState("");
  // Inline expand/collapse. React Native Paper Menu renders through a
  // Portal that sits BELOW native Modals — tapping it did nothing. Inline
  // lists render inside the modal itself so they behave predictably.
  const [vehicleListOpen, setVehicleListOpen] = useState(false);
  const [driverListOpen, setDriverListOpen] = useState(false);

  const primaryDays = primaryBooking.days ?? [];
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const selectedDriver = drivers.find((d) => d.id === driverId);
  const primaryVehicleId = primaryBooking.car?.id ?? null;
  // Exclude the primary booking's vehicle so the operator can't
  // accidentally pick the same one twice.
  const availableVehicles = useMemo(
    () =>
      vehicles.filter(
        (v) => v.is_active && v.id !== primaryVehicleId
      ),
    [vehicles, primaryVehicleId]
  );

  function reset() {
    setVehicleId(null);
    setDriverId(null);
    setClientRate("");
    setDriverRate("");
    setPickupOverride("");
    setDropoffOverride("");
    setNotesOverride("");
    setVehicleListOpen(false);
    setDriverListOpen(false);
  }

  function pickVehicle(v: Vehicle) {
    setVehicleId(v.id);
    // Prefill rates from vehicle defaults if the operator hasn't typed
    // anything yet. Never overwrite operator input.
    setClientRate((r) => (r ? r : v.price ?? ""));
    setDriverRate((r) => (r ? r : v.driver?.default_daily_rate ?? ""));
    // Prefill driver from vehicle default too, unless operator picked
    // one explicitly.
    setDriverId((cur) => (cur == null ? v.driver?.id ?? null : cur));
    setVehicleListOpen(false);
  }

  async function handleConfirm() {
    if (vehicleId == null) {
      Alert.alert("Pick a vehicle first.");
      return;
    }
    const clientRateNum = parseFloat(clientRate);
    const driverRateNum = parseFloat(driverRate);
    if (isNaN(clientRateNum) || clientRateNum <= 0) {
      Alert.alert("Enter a valid client rate.");
      return;
    }
    if (isNaN(driverRateNum) || driverRateNum < 0) {
      Alert.alert("Enter a valid driver rate.");
      return;
    }
    if (primaryDays.length === 0) {
      Alert.alert(
        "This booking has no scheduled days on it, so we can't derive dates for the second vehicle. Edit the primary booking first."
      );
      return;
    }

    // Expand each of the primary's days into a day row for the new
    // vehicle. Times mirror the primary's — 95% of "two cars same
    // tour" runs on the same schedule. Operator can tweak per-day
    // after the group is created.
    const days: CreateBookingDayPayload[] = primaryDays.map((d) => ({
      date: d.date,
      day_type: d.day_type,
      start_time: d.start_time,
      end_time: d.end_time,
      notes: null,
      client_rate: clientRateNum.toFixed(2),
      driver_rate: driverRateNum.toFixed(2),
      driver_payment_status: "unpaid",
    }));

    const child: CreateBookingGroupChildPayload = {
      car: vehicleId,
      driver: driverId,
      pickup_location:
        pickupOverride.trim() || primaryBooking.pickup_location || "",
      dropoff_location:
        dropoffOverride.trim() || primaryBooking.dropoff_location || "",
      trip_description:
        notesOverride.trim() || primaryBooking.trip_description || "",
      days,
    };

    await onSubmit(child);
    reset();
  }

  function handleClose() {
    if (submitting) return;
    onClose();
    reset();
  }

  const dayCount = primaryDays.length;
  const totalClient =
    !isNaN(parseFloat(clientRate)) && dayCount > 0
      ? parseFloat(clientRate) * dayCount
      : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetOverlay}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.sheetBackdrop}
          onPress={handleClose}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.sheetTitle}>Add another vehicle</Text>
            <Text style={styles.sheetSub}>
              This will bundle {primaryBooking.booking_reference} with a
              second vehicle into a group proposal — one URL, one combined
              total, one Yoco payment link.
            </Text>

            <Text style={styles.sheetLabel}>Vehicle</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setVehicleListOpen((v) => !v)}
              style={styles.sheetPickerRow}
            >
              <Text
                style={[
                  styles.sheetPickerRowText,
                  !selectedVehicle && styles.sheetPickerRowTextMuted,
                ]}
              >
                {selectedVehicle ? selectedVehicle.title : "Choose a vehicle"}
              </Text>
              <Text style={styles.sheetPickerChevron}>
                {vehicleListOpen ? "▴" : "▾"}
              </Text>
            </TouchableOpacity>
            {vehicleListOpen ? (
              <View style={styles.sheetInlineList}>
                {availableVehicles.length === 0 ? (
                  <Text style={styles.sheetInlineEmpty}>
                    No other vehicles available.
                  </Text>
                ) : (
                  availableVehicles.map((v) => {
                    const active = vehicleId === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        onPress={() => pickVehicle(v)}
                        activeOpacity={0.85}
                        style={[
                          styles.sheetInlineOption,
                          active && styles.sheetInlineOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sheetInlineOptionText,
                            active && styles.sheetInlineOptionTextActive,
                          ]}
                        >
                          {v.title}
                        </Text>
                        {active ? (
                          <Text style={styles.sheetInlineOptionCheck}>✓</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : null}

            <Text style={styles.sheetLabel}>Driver</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setDriverListOpen((v) => !v)}
              style={styles.sheetPickerRow}
            >
              <Text
                style={[
                  styles.sheetPickerRowText,
                  !selectedDriver && styles.sheetPickerRowTextMuted,
                ]}
              >
                {selectedDriver
                  ? selectedDriver.full_name
                  : "No driver assigned"}
              </Text>
              <Text style={styles.sheetPickerChevron}>
                {driverListOpen ? "▴" : "▾"}
              </Text>
            </TouchableOpacity>
            {driverListOpen ? (
              <View style={styles.sheetInlineList}>
                <TouchableOpacity
                  onPress={() => {
                    setDriverId(null);
                    setDriverListOpen(false);
                  }}
                  activeOpacity={0.85}
                  style={[
                    styles.sheetInlineOption,
                    driverId == null && styles.sheetInlineOptionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetInlineOptionText,
                      driverId == null && styles.sheetInlineOptionTextActive,
                    ]}
                  >
                    No driver assigned
                  </Text>
                  {driverId == null ? (
                    <Text style={styles.sheetInlineOptionCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
                {drivers.map((d) => {
                  const active = driverId === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => {
                        setDriverId(d.id);
                        setDriverListOpen(false);
                      }}
                      activeOpacity={0.85}
                      style={[
                        styles.sheetInlineOption,
                        active && styles.sheetInlineOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sheetInlineOptionText,
                          active && styles.sheetInlineOptionTextActive,
                        ]}
                      >
                        {d.full_name}
                      </Text>
                      {active ? (
                        <Text style={styles.sheetInlineOptionCheck}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.sheetRatesRow}>
              <TextInput
                label="Client rate (R / day)"
                value={clientRate}
                onChangeText={setClientRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.sheetRateInput}
              />
              <TextInput
                label="Driver rate (R / day)"
                value={driverRate}
                onChangeText={setDriverRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.sheetRateInput}
              />
            </View>

            {dayCount > 0 ? (
              <Text style={styles.sheetHint}>
                Uses the primary booking's {dayCount}{" "}
                {dayCount === 1 ? "day" : "days"} and times.
                {totalClient > 0
                  ? `  Total for this vehicle: R ${totalClient.toFixed(2)}.`
                  : ""}
              </Text>
            ) : (
              <Text style={styles.sheetHint}>
                ⚠ Primary booking has no scheduled days yet.
              </Text>
            )}

            <TextInput
              label="Pickup (optional override)"
              value={pickupOverride}
              onChangeText={setPickupOverride}
              mode="outlined"
              style={styles.sheetOverrideInput}
              placeholder={primaryBooking.pickup_location || undefined}
            />
            <TextInput
              label="Dropoff (optional override)"
              value={dropoffOverride}
              onChangeText={setDropoffOverride}
              mode="outlined"
              style={styles.sheetOverrideInput}
              placeholder={primaryBooking.dropoff_location || undefined}
            />
            <TextInput
              label="Notes for this vehicle (optional)"
              value={notesOverride}
              onChangeText={setNotesOverride}
              mode="outlined"
              multiline
              numberOfLines={2}
              style={styles.sheetOverrideInput}
              placeholder="e.g. Second car for luggage / larger group"
            />

            <View style={styles.sheetActionsRow}>
              <Button
                mode="text"
                onPress={handleClose}
                disabled={submitting}
                textColor={colors.muted}
                style={styles.sheetActionButton}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleConfirm}
                loading={submitting}
                disabled={submitting || vehicleId == null}
                buttonColor={colors.primary}
                textColor={colors.onPrimary}
                style={styles.sheetActionButton}
                icon="check"
              >
                Add to proposal
              </Button>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

// Per-segment accommodation row: kind badge + date range + name + hero
// photo strip pulling the linked villa / hotel's cover_photos so the
// operator can eyeball what the client will see.
function AccommodationSegmentRow({ segment }: { segment: AccommodationSegment }) {
  const target = segment.kind === "villa" ? segment.villa : segment.hotel;
  const name = target?.name ?? "(missing)";
  const location =
    segment.kind === "villa"
      ? segment.villa?.location
      : segment.hotel?.location;
  const priceLine =
    segment.kind === "villa" && segment.villa?.price_per_night
      ? `${segment.villa.price_currency || "ZAR"} ${segment.villa.price_per_night} / night`
      : segment.kind === "hotel" && segment.hotel?.price_per_night_from
        ? `from ${segment.hotel.price_currency || "ZAR"} ${segment.hotel.price_per_night_from} / night`
        : null;

  // Show up to 3 cover photos as a horizontal strip.
  const photos = (target?.cover_photos ?? []).slice(0, 3);

  const dateLabel =
    segment.start_date === segment.end_date
      ? segment.start_date
      : `${segment.start_date} → ${segment.end_date}`;

  return (
    <View style={styles.bundleItem}>
      <Text style={styles.bundleKind}>
        {segment.kind.toUpperCase()}  ·  {dateLabel}
      </Text>
      <Text style={styles.bundleTitle}>{name}</Text>
      {location || priceLine ? (
        <Text style={styles.bundleSub}>
          {location}
          {location && priceLine ? "  ·  " : ""}
          {priceLine}
        </Text>
      ) : null}
      {segment.notes ? (
        <Text style={styles.bundleNotes}>{segment.notes}</Text>
      ) : null}
      {photos.length > 0 ? (
        <View style={styles.bundlePhotoStrip}>
          {photos.map((p) => (
            <ShimmerImage
              key={p.id}
              uri={p.cover_photos}
              style={styles.bundlePhoto}
            />
          ))}
        </View>
      ) : null}
    </View>
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

  // Action row — two buttons per row, wraps as more actions become available.
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  actionButton: { flexBasis: "48%", flexGrow: 1, borderRadius: 14 },
  actionContent: { height: 48 },
  actionLabel: { fontWeight: "700", fontSize: 13 },

  // Paid confirmation pill — shown after Yoco webhook flips is_paid.
  paidPillWrap: {
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  paidPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#dff0e7",
  },
  paidPillText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },

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

  // Bundle add-ons (villa / experiences / packages).
  bundleItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bundleKind: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  bundleTitle: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  bundleSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  bundleNotes: {
    color: colors.text,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 6,
  },
  bundlePhotoStrip: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  bundlePhoto: {
    width: 72,
    height: 54,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
  },

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

  // Group membership chip: booking belongs to a multi-vehicle proposal.
  groupChip: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(11,91,51,0.08)",
    borderWidth: 1,
    borderColor: "rgba(11,91,51,0.2)",
  },
  groupChipIcon: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primary,
    marginRight: 10,
  },
  groupChipBody: { flex: 1 },
  groupChipTitle: {
    color: colors.heading,
    fontSize: 13,
    fontWeight: "700",
  },
  groupChipRef: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 2,
  },
  groupChipChevron: { color: colors.primary, fontSize: 22, marginLeft: 6 },

  // Add-vehicle sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetBackdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingTop: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetContent: { padding: 20, paddingBottom: 32 },
  sheetTitle: {
    color: colors.heading,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  sheetSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  sheetLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 6,
  },
  sheetPicker: { borderRadius: 12, borderColor: colors.border },
  sheetPickerContent: { height: 48, justifyContent: "flex-start" },
  sheetPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sheetPickerRowText: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  sheetPickerRowTextMuted: { color: colors.muted, fontWeight: "500" },
  sheetPickerChevron: {
    color: colors.muted,
    fontSize: 14,
    marginLeft: 10,
  },
  sheetInlineList: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  sheetInlineEmpty: {
    padding: 12,
    color: colors.muted,
    fontSize: 13,
    fontStyle: "italic",
  },
  sheetInlineOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetInlineOptionActive: {
    backgroundColor: "rgba(11,91,51,0.1)",
  },
  sheetInlineOptionText: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "600",
  },
  sheetInlineOptionTextActive: { color: colors.primary, fontWeight: "800" },
  sheetInlineOptionCheck: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
  },
  sheetRatesRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  sheetRateInput: { flex: 1, backgroundColor: colors.surface },
  sheetOverrideInput: {
    marginTop: 8,
    backgroundColor: colors.surface,
  },
  sheetHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    fontStyle: "italic",
  },
  sheetActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    gap: 10,
  },
  sheetActionButton: { borderRadius: 12 },

  // Missing-reference warning banner.
  noRefBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fdf1d8",
    borderWidth: 1,
    borderColor: "#e8d29a",
  },
  noRefBannerText: {
    color: "#8a6411",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
});
