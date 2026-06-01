import React, { useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Text,
  TextInput,
} from "react-native-paper";
import { useCreateDriver, useDrivers } from "@/hooks/useDrivers";
import { formatApiError } from "@/api/errors";
import { colors } from "@/theme";
import type { Driver } from "@/api/types";

export default function DriverListScreen() {
  const driversQuery = useDrivers();
  const createMutation = useCreateDriver();

  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  async function handleAdd() {
    const name = fullName.trim();
    const wa = whatsapp.trim();
    if (!name) {
      Alert.alert("Name required", "Please enter the driver's full name.");
      return;
    }
    if (!wa) {
      Alert.alert(
        "WhatsApp required",
        "Please enter the driver's WhatsApp number, including country code."
      );
      return;
    }
    try {
      await createMutation.mutateAsync({ full_name: name, whatsapp: wa });
      setFullName("");
      setWhatsapp("");
    } catch (err: unknown) {
      Alert.alert("Couldn't add driver", formatApiError(err));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={driversQuery.data ?? []}
        keyExtractor={(d) => String(d.id)}
        refreshControl={
          <RefreshControl
            refreshing={driversQuery.isRefetching}
            onRefresh={() => driversQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <Card style={styles.addCard} mode="elevated">
            <Card.Content>
              <Text style={styles.addTitle}>Add driver</Text>
              <Text style={styles.addSubtitle}>
                Drivers can be assigned to bookings and sent trip info via
                WhatsApp.
              </Text>
              <TextInput
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                mode="outlined"
                style={styles.input}
                autoCapitalize="words"
              />
              <TextInput
                label="WhatsApp (with country code)"
                value={whatsapp}
                onChangeText={setWhatsapp}
                mode="outlined"
                keyboardType="phone-pad"
                placeholder="+27..."
                style={styles.input}
              />
              <Button
                mode="contained"
                onPress={handleAdd}
                loading={createMutation.isPending}
                disabled={createMutation.isPending}
                style={styles.addButton}
                contentStyle={styles.addButtonContent}
                labelStyle={styles.addButtonLabel}
              >
                Add driver
              </Button>
            </Card.Content>
          </Card>
        }
        ListEmptyComponent={
          driversQuery.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : driversQuery.error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Couldn't load drivers.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No drivers yet.</Text>
              <Text style={styles.emptyHint}>
                Add your first driver above.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <DriverRow driver={item} />}
      />
    </KeyboardAvoidingView>
  );
}

function DriverRow({ driver }: { driver: Driver }) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {driver.full_name?.[0]?.toUpperCase() ?? "?"}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{driver.full_name}</Text>
        <Text style={styles.rowMeta}>
          {driver.whatsapp || driver.phone || "No WhatsApp on file"}
        </Text>
      </View>
      {!driver.is_active ? (
        <View style={styles.inactivePill}>
          <Text style={styles.inactivePillText}>INACTIVE</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  addCard: { borderRadius: 16, backgroundColor: colors.surface, marginBottom: 18 },
  addTitle: { color: colors.heading, fontSize: 17, fontWeight: "800" },
  addSubtitle: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: 12 },
  input: { marginBottom: 10, backgroundColor: colors.surface },
  addButton: { borderRadius: 12, marginTop: 6 },
  addButtonContent: { height: 48 },
  addButtonLabel: { fontWeight: "700", letterSpacing: 0.3 },
  empty: { padding: 24, alignItems: "center" },
  emptyText: { color: colors.text, fontWeight: "600", marginBottom: 4 },
  emptyHint: { color: colors.muted, fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.primary, fontSize: 18, fontWeight: "800" },
  rowBody: { flex: 1, marginLeft: 12 },
  rowName: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  inactivePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  inactivePillText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
