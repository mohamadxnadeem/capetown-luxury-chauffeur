import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { logout } from "@/api/auth";
import { useAuthStore } from "@/state/auth";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

export default function ProfileScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const role = useAuthStore((s) => s.role);
  const driver = useAuthStore((s) => s.driver);
  const signedOut = useAuthStore((s) => s.signedOut);
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
    } finally {
      signedOut();
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text style={styles.label}>SIGNED IN AS</Text>
          <Text style={styles.name}>
            {driver?.full_name ?? "Admin user"}
          </Text>
          <Text style={styles.role}>{role ?? "unknown"} account</Text>
        </Card.Content>
      </Card>

      {role === "admin" ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate("DriverList")}
          style={styles.navRow}
        >
          <View style={styles.navIcon}>
            <Text style={styles.navIconText}>👤</Text>
          </View>
          <View style={styles.navBody}>
            <Text style={styles.navTitle}>Drivers</Text>
            <Text style={styles.navSubtitle}>
              View, add and manage drivers
            </Text>
          </View>
          <Text style={styles.navChevron}>›</Text>
        </TouchableOpacity>
      ) : null}

      <Button
        mode="contained"
        onPress={handleLogout}
        loading={busy}
        disabled={busy}
        style={styles.signOut}
        contentStyle={styles.signOutContent}
        labelStyle={styles.signOutLabel}
      >
        Sign out
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: colors.background },
  card: { borderRadius: 16, backgroundColor: colors.surface },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  name: {
    color: colors.heading,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  role: { color: colors.muted, textTransform: "capitalize" },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
  },
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconText: { fontSize: 18 },
  navBody: { flex: 1, marginLeft: 12 },
  navTitle: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  navSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  navChevron: { color: colors.muted, fontSize: 24, marginLeft: 6 },
  signOut: { borderRadius: 14 },
  signOutContent: { height: 48 },
  signOutLabel: { fontWeight: "700", letterSpacing: 0.3 },
});
