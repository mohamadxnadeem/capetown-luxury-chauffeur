import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Button, Text, TextInput } from "react-native-paper";
import type { BookingDay, DriverNested } from "@/api/types";
import { formatApiError } from "@/api/errors";
import { useSplitDay } from "@/hooks/useBookingDays";
import { DriverSelect } from "@/components/DriverSelect";
import { sheetStyles as styles } from "@/components/sheetStyles";
import { defaultSplitTime, hhmm, toMinutes } from "@/utils/dayShifts";
import { colors } from "@/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  bookingId: number;
  day: BookingDay | null;
  drivers: DriverNested[];
  bookingDriverName: string | null;
}

export function SplitShiftSheet({
  visible,
  onClose,
  bookingId,
  day,
  drivers,
  bookingDriverName,
}: Props) {
  const mutation = useSplitDay(bookingId);
  const [splitTime, setSplitTime] = useState("");
  const [driverId, setDriverId] = useState<number | null>(null);
  const [clientRate, setClientRate] = useState("0");
  const [driverRate, setDriverRate] = useState("");

  useEffect(() => {
    if (!visible || !day) return;
    setSplitTime(defaultSplitTime(day));
    setDriverId(null);
    setClientRate("0");
    setDriverRate(day.driver_rate ? String(day.driver_rate) : "");
  }, [visible, day]);

  async function handleSave() {
    if (!day) return;
    const t = splitTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(t) || toMinutes(t) == null) {
      Alert.alert("Enter the split time as HH:MM, for example 17:30.");
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
    try {
      await mutation.mutateAsync({
        id: day.id,
        payload: {
          split_time: t.padStart(5, "0"),
          driver: driverId,
          client_rate: clientRate,
          driver_rate: driverRate,
        },
      });
      onClose();
    } catch (err: unknown) {
      Alert.alert("Couldn't split the shift", formatApiError(err));
    }
  }

  function handleClose() {
    if (!mutation.isPending) onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Split shift</Text>
            <Text style={styles.sub}>
              {day
                ? `${day.date}, ${hhmm(day.start_time)} - ${hhmm(day.end_time)}${
                    day.end_next_day ? " (next day)" : ""
                  }. Both shifts stay on this booking.`
                : ""}
            </Text>
            <TextInput
              label="Split time (HH:MM)"
              value={splitTime}
              onChangeText={setSplitTime}
              mode="outlined"
              keyboardType="numbers-and-punctuation"
              placeholder="17:30"
              style={styles.input}
            />
            <Text style={styles.label}>Driver for the second shift</Text>
            <DriverSelect
              drivers={drivers}
              value={driverId}
              onChange={setDriverId}
              nullLabel={
                bookingDriverName
                  ? `Booking driver (${bookingDriverName})`
                  : "Booking driver"
              }
            />
            <View style={styles.rates}>
              <TextInput
                label="Client rate (R)"
                value={clientRate}
                onChangeText={setClientRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.rateInput}
              />
              <TextInput
                label="Driver rate (R)"
                value={driverRate}
                onChangeText={setDriverRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.rateInput}
              />
            </View>
            <Text style={styles.hint}>
              Client rate defaults to 0 so the client total does not change.
              The first shift keeps its rates. Adjust either shift's times
              afterwards with Edit times.
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
              Split shift
            </Button>
            <Button onPress={handleClose} disabled={mutation.isPending} textColor={colors.muted} style={{ marginTop: 4 }}>
              Cancel
            </Button>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
