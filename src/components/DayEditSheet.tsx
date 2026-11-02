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
import type { BookingDay } from "@/api/types";
import { formatApiError } from "@/api/errors";
import { useUpdateDay } from "@/hooks/useBookingDays";
import { sheetStyles as styles } from "@/components/sheetStyles";
import { hhmm, toMinutes } from "@/utils/dayShifts";
import { colors } from "@/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  bookingId: number;
  day: BookingDay | null;
}

// Adjust one shift's start and end. An end earlier than the start means the
// shift runs past midnight (end_next_day).
export function DayEditSheet({ visible, onClose, bookingId, day }: Props) {
  const mutation = useUpdateDay(bookingId);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  useEffect(() => {
    if (!visible || !day) return;
    setStart(hhmm(day.start_time));
    setEnd(hhmm(day.end_time));
  }, [visible, day]);

  async function handleSave() {
    if (!day) return;
    const s = toMinutes(start.trim());
    const e = toMinutes(end.trim());
    if (s == null || e == null) {
      Alert.alert("Enter both times as HH:MM, for example 09:00.");
      return;
    }
    if (s === e) {
      Alert.alert("Start and end can't be the same time.");
      return;
    }
    try {
      await mutation.mutateAsync({
        id: day.id,
        patch: {
          start_time: `${start.trim().padStart(5, "0")}:00`,
          end_time: `${end.trim().padStart(5, "0")}:00`,
          end_next_day: e < s,
        },
      });
      onClose();
    } catch (err: unknown) {
      Alert.alert("Couldn't save the times", formatApiError(err));
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
            <Text style={styles.title}>Edit shift times</Text>
            <Text style={styles.sub}>{day ? day.date : ""}</Text>
            <View style={styles.rates}>
              <TextInput
                label="Start (HH:MM)"
                value={start}
                onChangeText={setStart}
                mode="outlined"
                keyboardType="numbers-and-punctuation"
                style={styles.rateInput}
              />
              <TextInput
                label="End (HH:MM)"
                value={end}
                onChangeText={setEnd}
                mode="outlined"
                keyboardType="numbers-and-punctuation"
                style={styles.rateInput}
              />
            </View>
            <Text style={styles.hint}>
              An end time earlier than the start means the shift ends the next
              day. Shifts on the same date can touch but not overlap.
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
              Save times
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
