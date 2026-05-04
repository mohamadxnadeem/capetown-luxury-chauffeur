import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import { detectRole, login, registerPushToken } from "@/api/auth";
import { useAuthStore } from "@/state/auth";
import { registerForPushNotificationsAsync } from "@/utils/push";

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

      if (role === "driver") {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            await registerPushToken(token);
          }
        } catch (err) {
          // Push registration is non-fatal — log and carry on so the driver
          // can still use the app even if notifications didn't register.
          console.warn("[login] push token registration failed", err);
        }
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text variant="headlineMedium" style={styles.title}>
          Capetown Luxury Chauffeur
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Sign in
        </Text>
        <TextInput
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting || !username || !password}
          style={styles.button}
        >
          Sign in
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { textAlign: "center", marginBottom: 8 },
  subtitle: { textAlign: "center", marginBottom: 24, opacity: 0.7 },
  input: { marginBottom: 12 },
  button: { marginTop: 12 },
});
