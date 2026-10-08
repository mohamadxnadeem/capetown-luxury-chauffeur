import React, { useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Clipboard from "expo-clipboard";
import { logout } from "@/api/auth";
import {
  useCalendarToken,
  useRotateCalendarToken,
} from "@/hooks/useCalendarToken";
import { useAuthStore } from "@/state/auth";
import type { RootStackParamList } from "@/navigation/types";
import { formatApiError } from "@/api/errors";
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
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
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

      {role === "admin" ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate("PackageList")}
          style={styles.navRow}
        >
          <View style={styles.navIcon}>
            <Text style={styles.navIconText}>🎁</Text>
          </View>
          <View style={styles.navBody}>
            <Text style={styles.navTitle}>Packages</Text>
            <Text style={styles.navSubtitle}>
              Manage pre-built tour packages
            </Text>
          </View>
          <Text style={styles.navChevron}>›</Text>
        </TouchableOpacity>
      ) : null}

      {role === "admin" ? <CalendarFeedCard /> : null}

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
    </ScrollView>
  );
}

// Personal iCal feed card — subscribes the operator's phone Calendar app
// to every fleet booking. Backend fires reminders 24h and 2h before each
// event natively so the operator gets notified even when this app is
// closed. Rotation invalidates the previous URL immediately.
function CalendarFeedCard() {
  const tokenQuery = useCalendarToken();
  const rotateMutation = useRotateCalendarToken();

  async function handleEnable() {
    try {
      await rotateMutation.mutateAsync();
    } catch (err: unknown) {
      Alert.alert("Couldn't enable calendar feed", formatApiError(err));
    }
  }

  async function handleCopy(url: string) {
    await Clipboard.setStringAsync(url);
    Alert.alert("Copied", "Calendar feed URL copied to your clipboard.");
  }

  async function handleOpenInCalendar(webcalUrl: string) {
    try {
      await Linking.openURL(webcalUrl);
    } catch {
      Alert.alert(
        "Couldn't open Calendar",
        "Copy the URL and add it manually in your Calendar app."
      );
    }
  }

  function handleRotate() {
    Alert.alert(
      "Rotate calendar token?",
      "Your previous calendar URL stops working immediately. You'll need to re-subscribe using the new URL on every device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Rotate",
          style: "destructive",
          onPress: () => rotateMutation.mutate(),
        },
      ]
    );
  }

  if (tokenQuery.isLoading) {
    return (
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <ActivityIndicator color={colors.primary} />
        </Card.Content>
      </Card>
    );
  }

  const data = tokenQuery.data;
  const hasToken = !!data?.token;

  return (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <Text style={styles.label}>PERSONAL CALENDAR FEED</Text>
        <Text style={styles.calBody}>
          Subscribe your phone's Calendar app to see every fleet booking.
          Reminders 24h and 2h before each event fire even when this app is
          closed.
        </Text>

        {hasToken ? (
          <>
            <View style={styles.calUrlBox}>
              <Text style={styles.calUrl} selectable numberOfLines={2}>
                {data!.ical_url}
              </Text>
            </View>
            <View style={styles.calButtonsRow}>
              <Button
                mode="outlined"
                onPress={() => handleCopy(data!.ical_url!)}
                icon="content-copy"
                style={styles.calButton}
                textColor={colors.primary}
              >
                Copy URL
              </Button>
              {data!.webcal_url ? (
                <Button
                  mode="contained"
                  onPress={() => handleOpenInCalendar(data!.webcal_url!)}
                  icon="calendar-plus"
                  style={styles.calButton}
                  buttonColor={colors.primary}
                  textColor={colors.onPrimary}
                >
                  Open in Calendar
                </Button>
              ) : null}
            </View>
            <Button
              mode="text"
              onPress={handleRotate}
              loading={rotateMutation.isPending}
              disabled={rotateMutation.isPending}
              textColor={colors.muted}
              style={{ marginTop: 4 }}
            >
              Rotate token
            </Button>
          </>
        ) : (
          <Button
            mode="contained"
            onPress={handleEnable}
            loading={rotateMutation.isPending}
            disabled={rotateMutation.isPending}
            icon="calendar-plus"
            style={[styles.calButton, { marginTop: 12 }]}
            buttonColor={colors.primary}
            textColor={colors.onPrimary}
          >
            Enable my calendar feed
          </Button>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  card: { borderRadius: 16, backgroundColor: colors.surface },
  calBody: { color: colors.text, fontSize: 13, lineHeight: 19 },
  calUrlBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calUrl: { color: colors.text, fontSize: 11, fontFamily: "monospace" },
  calButtonsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  calButton: { flex: 1, borderRadius: 10 },
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
