import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import type { Booking } from "@/api/types";
import { useBookingFormOptions } from "@/hooks/useBookings";
import { useDriverChange } from "@/hooks/useDriverChange";
import { splitDay, toMinutes } from "@/utils/driverChange";
import { vehicleLabel } from "@/utils/vehicle";
import { colors } from "@/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  booking: Booking;
  // Group the booking sits in, or null for a standalone booking (it is
  // promoted to a group first).
  groupId?: number | null;
  // Called after a successful change with the group id.
  onDone: (groupId: number) => void;
}

function hhmm(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function DriverChangeSheet({
  visible,
  onClose,
  booking,
  groupId,
  onDone,
}: Props) {
  const optionsQuery = useBookingFormOptions();
  const mutation = useDriverChange();
  const drivers = (optionsQuery.data?.drivers ?? []).filter((d) => d.is_active);
  const days = useMemo(
    () =>
      (booking.days ?? []).filter(
        (d) => toMinutes(d.start_time) != null && toMinutes(d.end_time) != null
      ),
    [booking.days]
  );

  const [changeTime, setChangeTime] = useState("");
  const [driverId, setDriverId] = useState<number | null>(null);
  const [driverListOpen, setDriverListOpen] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [clientRate, setClientRate] = useState("0");
  const [driverRate, setDriverRate] = useState("");

  useEffect(() => {
    if (!visible) return;
    setChangeTime("");
    setDriverId(null);
    setDriverListOpen(false);
    setDates(days.map((d) => d.date));
    setClientRate("0");
    setDriverRate(days[0]?.driver_rate ? String(days[0].driver_rate) : "");
  }, [visible, days]);

  const selectedDriver = drivers.find((d) => d.id === driverId);
  const first = days[0];

  function toggleDate(date: string) {
    setDates((cur) =>
      cur.includes(date) ? cur.filter((x) => x !== date) : [...cur, date]
    );
  }

  async function handleSave() {
    if (!/^\d{1,2}:\d{2}$/.test(changeTime.trim()) || toMinutes(changeTime) == null) {
      Alert.alert("Enter the change time as HH:MM, for example 17:00.");
      return;
    }
    if (driverId == null) {
      Alert.alert("Pick the new driver.");
      return;
    }
    if (dates.length === 0) {
      Alert.alert("Pick at least one day.");
      return;
    }
    const cr = parseFloat(clientRate);
    const dr = parseFloat(driverRate);
    if (isNaN(cr) || cr < 0) {
      Alert.alert("Enter a valid client rate (0 or more).");
      return;
    }
    if (isNaN(dr) || dr < 0) {
      Alert.alert("Enter a valid driver rate.");
      return;
    }
    for (const d of days.filter((x) => dates.includes(x.date))) {
      const s = splitDay(d, changeTime.trim());
      if (typeof s === "string") {
        Alert.alert("Change time doesn't fit", s);
        return;
      }
    }
    try {
      const gid = await mutation.mutateAsync({
        booking,
        groupId,
        changeTime: changeTime.trim().padStart(5, "0"),
        driverId,
        dates,
        clientRate,
        driverRate,
      });
      onClose();
      onDone(gid);
    } catch (err: unknown) {
      Alert.alert(
        "Driver change not completed",
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
  }

  function handleClose() {
    if (mutation.isPending) return;
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.backdrop}
          onPress={handleClose}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Driver change</Text>
            <Text style={styles.sub}>
              {booking.car ? vehicleLabel(booking.car) : "Vehicle"}
              {first
                ? `  ·  ${hhmm(first.start_time)} to ${hhmm(first.end_time)}${first.end_next_day ? " (next day)" : ""}`
                : ""}
              {"\n"}
              The current driver stops at the change time and the new driver
              takes over until the original end.
              {!groupId
                ? " This booking is not in a group yet, so it will be turned into one."
                : ""}
            </Text>

            <TextInput
              label="Change time (HH:MM)"
              value={changeTime}
              onChangeText={setChangeTime}
              mode="outlined"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              placeholder="17:00"
              style={styles.input}
            />

            <Text style={styles.label}>New driver</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setDriverListOpen((v) => !v)}
              style={styles.pickerRow}
            >
              <Text
                style={[styles.pickerText, !selectedDriver && styles.muted]}
              >
                {selectedDriver ? selectedDriver.full_name : "Choose a driver"}
              </Text>
              <Text style={styles.chevron}>{driverListOpen ? "▴" : "▾"}</Text>
            </TouchableOpacity>
            {driverListOpen ? (
              <View style={styles.list}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {drivers.length === 0 ? (
                    <Text style={styles.empty}>No drivers found.</Text>
                  ) : (
                    drivers.map((d) => (
                      <TouchableOpacity
                        key={d.id}
                        activeOpacity={0.85}
                        onPress={() => {
                          setDriverId(d.id);
                          setDriverListOpen(false);
                        }}
                        style={[
                          styles.option,
                          driverId === d.id && styles.optionActive,
                        ]}
                      >
                        <Text style={styles.optionText}>{d.full_name}</Text>
                        {driverId === d.id ? (
                          <Text style={styles.check}>✓</Text>
                        ) : null}
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : null}

            <Text style={styles.label}>Applies to</Text>
            <View style={styles.chips}>
              {days.map((d) => {
                const on = dates.includes(d.date);
                return (
                  <TouchableOpacity
                    key={d.date}
                    activeOpacity={0.85}
                    onPress={() => toggleDate(d.date)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {prettyDate(d.date)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.rates}>
              <TextInput
                label="New shift client rate (R)"
                value={clientRate}
                onChangeText={setClientRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.rateInput}
              />
              <TextInput
                label="New shift driver rate (R)"
                value={driverRate}
                onChangeText={setDriverRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.rateInput}
              />
            </View>
            <Text style={styles.hint}>
              Client rate defaults to 0 so the client total does not change.
              The first shift keeps its rates.
            </Text>

            <Button
              mode="contained"
              buttonColor={colors.primary}
              textColor={colors.onPrimary}
              onPress={handleSave}
              loading={mutation.isPending}
              disabled={mutation.isPending}
              style={{ marginTop: 16 }}
            >
              Save driver change
            </Button>
            <Button
              onPress={handleClose}
              disabled={mutation.isPending}
              textColor={colors.muted}
              style={{ marginTop: 4 }}
            >
              Cancel
            </Button>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: "700", color: colors.heading },
  sub: { color: colors.muted, marginTop: 6, marginBottom: 12, lineHeight: 19 },
  input: { backgroundColor: colors.surface },
  label: {
    marginTop: 14,
    marginBottom: 6,
    fontWeight: "700",
    color: colors.heading,
  },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  pickerText: { color: colors.text, flex: 1 },
  muted: { color: colors.muted },
  chevron: { color: colors.muted, marginLeft: 8 },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginTop: 6,
  },
  empty: { padding: 12, color: colors.muted },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionActive: { backgroundColor: colors.surfaceMuted },
  optionText: { color: colors.text },
  check: { color: colors.primary, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text },
  chipTextOn: { color: colors.onPrimary, fontWeight: "700" },
  rates: { flexDirection: "row", gap: 8, marginTop: 14 },
  rateInput: { flex: 1, backgroundColor: colors.surface },
  hint: { color: colors.muted, marginTop: 8, fontSize: 12 },
});
