import React, { useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Text,
} from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import {
  useAddBookingToGroup,
  useAdminBookingGroup,
  useCancelBookingGroup,
  useConfirmBookingGroup,
  useRemoveBookingFromGroup,
} from "@/hooks/useBookingGroups";
import { useBookingFormOptions } from "@/hooks/useBookings";
import {
  bookingDateRange,
  type Booking,
  type BookingGroup,
} from "@/api/types";
import { bookingGroupProposalUrl } from "@/api/urls";
import { formatApiError } from "@/api/errors";
import { AddVehicleSheet } from "@/components/AddVehicleSheet";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

// ---- Helpers ------------------------------------------------------------

function digitsOnly(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D+/g, "");
}

function proposalMessage(g: BookingGroup): string {
  const proposalUrl = bookingGroupProposalUrl(g.group_reference);
  const vehicleCount = g.bookings.filter((b) => b.car).length;
  return [
    `Hi ${g.customer_name || "there"},`,
    "",
    g.title || "Your Cape Town Concierge booking confirmation.",
    "",
    vehicleCount > 0
      ? `🚗 ${vehicleCount} ${vehicleCount === 1 ? "vehicle" : "vehicles"}`
      : null,
    `💳 Total: ${g.currency || "ZAR"} ${g.total_client_amount}`,
    `🎫 Reference: ${g.group_reference}`,
    "",
    `View full details${g.payment_link ? " + pay securely" : ""}: ${proposalUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function paymentOnlyMessage(g: BookingGroup): string {
  return [
    `Hi ${g.customer_name || "there"},`,
    "",
    `Here's your payment link for ${g.group_reference}.`,
    "",
    `💳 Amount due: ${g.currency || "ZAR"} ${g.total_client_amount}`,
    `🔗 Pay securely: ${g.payment_link}`,
    "",
    `Once payment is received your booking is fully confirmed. Thank you!`,
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

export default function BookingGroupDetailScreen() {
  const route =
    useRoute<RouteProp<RootStackParamList, "BookingGroupDetail">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { groupId } = route.params;

  const groupQuery = useAdminBookingGroup(groupId);
  const confirmMutation = useConfirmBookingGroup(groupId);
  const cancelMutation = useCancelBookingGroup(groupId);
  const removeMutation = useRemoveBookingFromGroup(groupId);
  const addBookingMutation = useAddBookingToGroup(groupId);
  const formOptionsQuery = useBookingFormOptions();

  const [busy, setBusy] = useState(false);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);

  if (groupQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (groupQuery.error || !groupQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>Couldn't load group.</Text>
      </View>
    );
  }

  const group = groupQuery.data;
  const isCancelled = group.status === "cancelled";
  const isConfirmed = group.status === "confirmed" || group.status === "completed";
  const clientDigits = digitsOnly(group.customer_phone);
  const proposalUrl = bookingGroupProposalUrl(group.group_reference);

  async function handleConfirm() {
    Alert.alert(
      "Confirm this booking?",
      "This flips every vehicle in the group to confirmed and generates one Yoco payment link for the whole amount.",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setBusy(true);
            try {
              await confirmMutation.mutateAsync();
            } catch (err: unknown) {
              Alert.alert("Couldn't confirm", formatApiError(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  async function handleCancel() {
    Alert.alert(
      "Cancel this whole group?",
      `Every vehicle in ${group.group_reference} will be cancelled. Their dates become available again.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Cancel group",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await cancelMutation.mutateAsync();
            } catch (err: unknown) {
              Alert.alert("Couldn't cancel", formatApiError(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  async function handleRemoveChild(booking: Booking) {
    Alert.alert(
      "Remove from group?",
      `${booking.booking_reference} will become a standalone booking. It stays in the system.`,
      [
        { text: "Keep in group", style: "cancel" },
        {
          text: "Detach",
          onPress: async () => {
            try {
              await removeMutation.mutateAsync({
                bookingId: booking.id,
                hardDelete: false,
              });
            } catch (err: unknown) {
              Alert.alert("Couldn't detach", formatApiError(err));
            }
          },
        },
      ]
    );
  }

  async function handleShareProposal() {
    try {
      await Share.share({
        message: proposalMessage(group),
        url: proposalUrl,
        title: group.title,
      });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  async function handleCopyUrl() {
    await Clipboard.setStringAsync(proposalUrl);
    Alert.alert("Copied", "Booking link copied to your clipboard.");
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Hero group={group} />

      {/* Primary actions */}
      {!isCancelled ? (
        <View style={styles.actionsRow}>
          <ActionButton
            icon="share-variant"
            label="Share booking"
            onPress={handleShareProposal}
          />
          <ActionButton
            icon="content-copy"
            label="Copy link"
            onPress={handleCopyUrl}
          />
          {clientDigits ? (
            <ActionButton
              icon="whatsapp"
              label="Send on WhatsApp"
              onPress={() =>
                openWhatsApp(clientDigits, proposalMessage(group))
              }
            />
          ) : null}
          {clientDigits && group.payment_link && !group.is_paid ? (
            <ActionButton
              icon="credit-card-outline"
              label="Send payment link"
              onPress={() =>
                openWhatsApp(clientDigits, paymentOnlyMessage(group))
              }
            />
          ) : null}
        </View>
      ) : null}

      {group.is_paid ? (
        <View style={styles.paidPillWrap}>
          <View style={styles.paidPill}>
            <Text style={styles.paidPillText}>✓ PAID</Text>
          </View>
        </View>
      ) : null}

      {/* Customer */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <SectionLabel>Customer</SectionLabel>
          <Row label="Name" value={group.customer_name} />
          <Row label="Phone" value={group.customer_phone} />
          <Row label="Email" value={group.customer_email} />

          <Divider style={styles.divider} />

          <SectionLabel>Booking</SectionLabel>
          <Row label="Title" value={group.title} />
          <Row
            label="Total"
            value={`${group.currency || "ZAR"} ${group.total_client_amount}`}
            bold
          />
          <Row
            label="Vehicles"
            value={group.bookings.length}
          />
          {group.notes ? <Row label="Notes" value={group.notes} /> : null}
        </Card.Content>
      </Card>

      {/* Child bookings */}
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <View style={styles.bookingsHeader}>
            <SectionLabel>Bookings in this group</SectionLabel>
            {!isCancelled ? (
              <Button
                compact
                onPress={() => setAddVehicleOpen(true)}
                icon="plus"
                textColor={colors.primary}
                disabled={addBookingMutation.isPending}
              >
                Add vehicle
              </Button>
            ) : null}
          </View>
          {group.bookings.map((b, i) => (
            <ChildBookingRow
              key={b.id}
              booking={b}
              index={i}
              isLast={i === group.bookings.length - 1}
              canDetach={!isCancelled && group.bookings.length > 1}
              onOpen={() =>
                navigation.navigate("BookingDetail", { bookingId: b.id })
              }
              onDetach={() => handleRemoveChild(b)}
            />
          ))}
        </Card.Content>
      </Card>

      {/* Manage */}
      {!isCancelled ? (
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <SectionLabel>Manage</SectionLabel>
            {!isConfirmed ? (
              <Button
                mode="contained"
                buttonColor={colors.primary}
                textColor={colors.onPrimary}
                onPress={handleConfirm}
                loading={busy || confirmMutation.isPending}
                disabled={busy || confirmMutation.isPending}
                style={styles.manageButton}
                contentStyle={styles.manageButtonContent}
                labelStyle={styles.manageLabel}
                icon="check-circle-outline"
              >
                Confirm booking (generate payment link)
              </Button>
            ) : null}
            <Button
              mode="outlined"
              onPress={handleCancel}
              loading={busy || cancelMutation.isPending}
              disabled={busy || cancelMutation.isPending}
              style={[styles.manageButton, styles.dangerButton]}
              contentStyle={styles.manageButtonContent}
              labelStyle={styles.manageLabel}
              textColor="#b03b3b"
              icon="close-circle-outline"
            >
              Cancel whole group
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <View style={styles.cancelledBanner}>
          <Text style={styles.cancelledText}>
            This group is cancelled.
          </Text>
        </View>
      )}

      {/* Add-vehicle sheet — attaches a new child booking to this group
          via /booking-groups/<id>/add-booking/. Pre-fills with the first
          child's dates/times/pickup as a convenient default, which the
          operator can override to use different dates per vehicle. */}
      <AddVehicleSheet
        visible={addVehicleOpen}
        onClose={() => setAddVehicleOpen(false)}
        defaultDates={(group.bookings[0]?.days ?? []).map((d) => d.date)}
        defaultDayType={group.bookings[0]?.days?.[0]?.day_type ?? "full_day"}
        defaultStartTime={group.bookings[0]?.days?.[0]?.start_time ?? null}
        defaultEndTime={group.bookings[0]?.days?.[0]?.end_time ?? null}
        defaultPickupLocation={group.bookings[0]?.pickup_location}
        defaultDropoffLocation={group.bookings[0]?.dropoff_location}
        excludeVehicleIds={group.bookings
          .map((b) => b.car?.id)
          .filter((id): id is number => id != null)}
        vehicles={formOptionsQuery.data?.vehicles ?? []}
        drivers={formOptionsQuery.data?.drivers ?? []}
        submitting={addBookingMutation.isPending}
        heading="Add vehicle to this booking"
        description={`${group.group_reference} — this adds another vehicle to the booking. Combined total and payment link update automatically.`}
        submitLabel="Add vehicle"
        onSubmit={async (child) => {
          try {
            await addBookingMutation.mutateAsync(child);
            setAddVehicleOpen(false);
          } catch (err: unknown) {
            Alert.alert("Couldn't add vehicle", formatApiError(err));
          }
        }}
      />
    </ScrollView>
  );
}

// ---- Sub-components -----------------------------------------------------

function Hero({ group }: { group: BookingGroup }) {
  const tone = statusTone(group.status);
  const firstBooking = group.bookings[0];
  const [firstDate] = firstBooking
    ? bookingDateRange(firstBooking)
    : ["", ""];
  const lastBooking = group.bookings[group.bookings.length - 1];
  const [, lastDate] = lastBooking ? bookingDateRange(lastBooking) : ["", ""];
  const dateLabel =
    firstDate && lastDate
      ? firstDate === lastDate
        ? firstDate
        : `${firstDate} → ${lastDate}`
      : "";

  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroContent}>
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>{group.group_reference}</Text>
          <View style={[styles.heroStatus, { backgroundColor: tone.bg }]}>
            <Text style={[styles.heroStatusText, { color: tone.fg }]}>
              {group.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>
          {group.title || `Trip for ${group.customer_name || "client"}`}
        </Text>
        {dateLabel ? <Text style={styles.heroDates}>{dateLabel}</Text> : null}
        <Text style={styles.heroTotal}>
          {group.currency || "ZAR"} {group.total_client_amount}
        </Text>
      </View>
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

function ChildBookingRow({
  booking,
  index,
  isLast,
  canDetach,
  onOpen,
  onDetach,
}: {
  booking: Booking;
  index: number;
  isLast: boolean;
  canDetach: boolean;
  onOpen: () => void;
  onDetach: () => void;
}) {
  const [start, end] = bookingDateRange(booking);
  const dateLabel = start
    ? start === end
      ? start
      : `${start} → ${end}`
    : "No dates";

  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.85}
      style={[styles.childRow, isLast && styles.childRowLast]}
    >
      <View style={styles.childBullet}>
        <Text style={styles.childBulletText}>{index + 1}</Text>
      </View>
      <View style={styles.childBody}>
        <Text style={styles.childTitle} numberOfLines={1}>
          {booking.car?.title ?? "Accommodation only"}
        </Text>
        <Text style={styles.childMeta} numberOfLines={1}>
          {booking.booking_reference}  ·  {dateLabel}
        </Text>
        {booking.driver?.full_name ? (
          <Text style={styles.childSub} numberOfLines={1}>
            👤 {booking.driver.full_name}
          </Text>
        ) : null}
      </View>
      <View style={styles.childActions}>
        {canDetach ? (
          <Button
            compact
            onPress={onDetach}
            textColor={colors.muted}
            style={styles.childDetach}
          >
            Detach
          </Button>
        ) : null}
        <Text style={styles.childChevron}>›</Text>
      </View>
    </TouchableOpacity>
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

  hero: {
    minHeight: 200,
    justifyContent: "flex-end",
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
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  heroDates: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    marginTop: 4,
    fontWeight: "600",
  },
  heroTotal: {
    color: colors.onPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 10,
  },

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
  bookingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  row: { flexDirection: "row", marginVertical: 3 },
  rowLabel: {
    width: 96,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  rowValue: { flex: 1, color: colors.text, fontSize: 14 },
  rowValueBold: { color: colors.primary, fontWeight: "800" },

  childRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  childRowLast: { borderBottomWidth: 0 },
  childBullet: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  childBulletText: { color: colors.primary, fontWeight: "800", fontSize: 12 },
  childBody: { flex: 1 },
  childTitle: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  childMeta: { color: colors.text, fontSize: 12, fontWeight: "600", marginTop: 2 },
  childSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  childActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  childDetach: { marginRight: 4 },
  childChevron: { color: colors.muted, fontSize: 22 },

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
