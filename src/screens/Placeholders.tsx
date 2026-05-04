import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

// Stubs for screens scheduled for v2. See TODO.md for the full punch list.

function Stub({ title, todo }: { title: string; todo: string }) {
  return (
    <View style={styles.container}>
      <Text variant="titleLarge">{title}</Text>
      <Text style={styles.todo}>TODO: {todo}</Text>
    </View>
  );
}

export const NewBookingScreen = () => (
  <Stub
    title="New Booking"
    todo="Build form: car -> driver auto-fill, dates, customer info, days. POST /api/admin/bookings/create/ then per-day POST /api/admin/bookings/<id>/days/create/."
  />
);

export const DriverListScreen = () => (
  <Stub title="Drivers" todo="GET /api/admin/drivers/ and render list with detail drill-down." />
);

export const VehicleListScreen = () => (
  <Stub title="Vehicles" todo="GET /api/admin/vehicles/ and render list with availability lookup." />
);

export const FinanceSummaryScreen = () => (
  <Stub title="Finance" todo="GET /api/admin/finance-summary/." />
);

export const PaymentSummaryScreen = () => (
  <Stub
    title="Payments"
    todo="GET /api/driver/payment-summary/?start_date=&end_date= with date-range picker."
  />
);

export const BlockedDatesScreen = () => (
  <Stub
    title="Blocked dates"
    todo="GET/POST /api/driver/blocked-dates/ and DELETE /api/driver/blocked-dates/<id>/delete/."
  />
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  todo: { marginTop: 12, textAlign: "center", opacity: 0.6 },
});
