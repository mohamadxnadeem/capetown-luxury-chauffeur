import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import { logout } from "@/api/auth";
import { useAuthStore } from "@/state/auth";

export default function ProfileScreen() {
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
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium">Signed in as</Text>
          <Text variant="bodyLarge">{driver?.full_name ?? "Admin user"}</Text>
          <Text variant="bodySmall" style={styles.muted}>
            Role: {role ?? "unknown"}
          </Text>
        </Card.Content>
      </Card>
      <Button mode="contained-tonal" onPress={handleLogout} loading={busy} disabled={busy}>
        Sign out
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  card: { marginBottom: 8 },
  muted: { opacity: 0.6, marginTop: 4 },
});
