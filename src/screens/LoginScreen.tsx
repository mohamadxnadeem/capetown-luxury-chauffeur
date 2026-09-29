import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button, Text, TextInput } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { detectRole, login, registerPushToken } from "@/api/auth";
import { useAuthStore } from "@/state/auth";
import { registerForPushNotificationsAsync } from "@/utils/push";
import { colors, gradientPrimary } from "@/theme";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const signedIn = useAuthStore((s) => s.signedIn);

  async function handleSubmit() {
    if (!username || !password) return;
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      const { role, driver } = await detectRole();

      // Register the push token for both roles — admins get booking-start
      // reminders (7d / 1d / 2h / 30m before) and drivers get trip
      // assignments. registerPushToken picks the right per-role endpoint.
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await registerPushToken(token);
        }
      } catch (err) {
        // Push registration is non-fatal — log and carry on so the user
        // can still use the app even if notifications didn't register.
        console.warn("[login] push token registration failed", err);
      }

      signedIn(role, driver);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (err as Error)?.message ??
        "Login failed";
      Alert.alert("Login failed", String(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LinearGradient
      colors={gradientPrimary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.flex}
    >
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>CAPE TOWN</Text>
              <Text style={styles.brand}>Concierge</Text>
              <Text style={styles.tagline}>
                Luxury chauffeur drives & private tours.
              </Text>
            </View>

            <View style={styles.card}>
              <Text variant="titleLarge" style={styles.cardTitle}>
                Sign in
              </Text>
              <Text style={styles.cardHelp}>
                Use your operator credentials to manage bookings, vehicles, and
                drivers.
              </Text>
              <TextInput
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                mode="outlined"
                style={styles.input}
              />
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={submitting}
                disabled={submitting || !username || !password}
                style={styles.button}
                contentStyle={styles.buttonContent}
                labelStyle={styles.buttonLabel}
              >
                Sign in
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  hero: {
    paddingTop: 24,
    paddingBottom: 48,
    alignItems: "flex-start",
  },
  eyebrow: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3,
    marginBottom: 8,
  },
  brand: {
    color: colors.onPrimary,
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 48,
    marginBottom: 16,
  },
  tagline: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 280,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    // Soft drop shadow consistent with site cards.
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardTitle: {
    color: colors.heading,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardHelp: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  input: { marginBottom: 12, backgroundColor: colors.surface },
  button: { marginTop: 8, borderRadius: 14 },
  buttonContent: { height: 52 },
  buttonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
});
