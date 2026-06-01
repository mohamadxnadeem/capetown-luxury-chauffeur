import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { colors } from "@/theme";

// Stubs for screens scheduled for v2. See TODO.md for the full punch list.

function Stub({ title, todo }: { title: string; todo: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.todo}>{todo}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>COMING SOON</Text>
      </View>
    </View>
  );
}

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
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.heading,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 12,
  },
  todo: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
});
