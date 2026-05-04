import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Card, Text } from "react-native-paper";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useAdminBooking, useDriverTrip } from "@/hooks/useBookings";
import { useAuthStore } from "@/state/auth";
import type { RootStackParamList } from "@/navigation/types";
import type { Booking } from "@/api/types";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{String(value)}</Text>
    </View>
  );
}

export default function BookingDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "BookingDetail">>();
  const role = useAuthStore((s) => s.role);
  const { bookingId, bookingRef } = route.params ?? {};

  const adminQuery = useAdminBooking(role === "admin" ? bookingId : undefined);
  const driverQuery = useDriverTrip(
    role === "driver" ? bookingRef : undefined
  );

  const isLoading = adminQuery.isLoading || driverQuery.isLoading;
  const error = adminQuery.error ?? driverQuery.error;
  const booking: Booking | undefined = adminQuery.data ?? driverQuery.data;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !booking) {
    return (
      <View style={styles.center}>
        <Text>Couldn't load booking.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Card.Title
          title={booking.customer_name ?? `Booking #${booking.id}`}
          subtitle={booking.booking_ref ?? undefined}
        />
        <Card.Content>
          <Row label="Status" value={booking.status} />
          <Row label="Phone" value={booking.customer_phone} />
          <Row label="Email" value={booking.customer_email} />
          <Row label="Start" value={booking.start_date} />
          <Row label="End" value={booking.end_date} />
          <Row label="Total" value={booking.total_price as string | number | undefined} />
        </Card.Content>
      </Card>

      {Array.isArray(booking.days) && booking.days.length > 0 ? (
        <Card style={styles.card}>
          <Card.Title title="Days" />
          <Card.Content>
            {booking.days.map((d) => (
              <View key={d.id} style={styles.day}>
                <Text variant="titleSmall">{d.date}</Text>
                <Row label="Start" value={d.start_time} />
                <Row label="End" value={d.end_time} />
                <Row label="Pickup" value={d.pickup_location} />
                <Row label="Dropoff" value={d.dropoff_location} />
                <Row label="Notes" value={d.notes} />
              </View>
            ))}
          </Card.Content>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { marginBottom: 16 },
  row: { flexDirection: "row", marginVertical: 2 },
  rowLabel: { width: 90, opacity: 0.6 },
  rowValue: { flex: 1 },
  day: { marginBottom: 12 },
});
