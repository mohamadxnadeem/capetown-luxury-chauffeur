import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, Menu, Text, TextInput } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useBookingFormOptions, useCreateBookingFromText } from "@/hooks/useBookings";
import { formatApiError } from "@/api/errors";
import type { BookingFromTextMissing, CarOption } from "@/api/types";
import { vehicleLabel } from "@/utils/vehicle";
import { colors } from "@/theme";
import type { RootStackParamList } from "@/navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PasteJobScreen() {
  const navigation = useNavigation<Nav>();
  const optionsQuery = useBookingFormOptions();
  const mutation = useCreateBookingFromText();

  const [text, setText] = useState("");
  const [carId, setCarId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Cars the backend sent back on a 422; used instead of the form options.
  const [carOptions, setCarOptions] = useState<CarOption[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsCar, setNeedsCar] = useState(false);

  const cars: CarOption[] =
    carOptions ??
    (optionsQuery.data?.vehicles ?? [])
      .filter((v) => v.is_active !== false)
      .map((v) => ({
        id: v.id,
        title: v.title,
        registration_number: v.registration_number ?? null,
      }));
  const selectedCar = cars.find((c) => c.id === carId);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setMessage("Please paste the job details.");
      return;
    }
    setMessage(null);
    mutation.mutate(
      { text: trimmed, ...(carId != null ? { car_id: carId } : {}) },
      {
        onSuccess: ({ booking, warnings }) => {
          const open = () =>
            navigation.replace("BookingDetail", { bookingId: booking.id });
          if (warnings && warnings.length > 0) {
            Alert.alert(
              "Booking created",
              warnings.map((w) => `- ${w}`).join("\n"),
              [{ text: "Open booking", onPress: open }],
              { cancelable: false }
            );
          } else {
            open();
          }
        },
        onError: (err: any) => {
          const status = err?.response?.status;
          const data = err?.response?.data;
          if (status === 422 && data) {
            const body = data as BookingFromTextMissing;
            setMessage(body.detail || formatApiError(err));
            if (Array.isArray(body.car_options)) setCarOptions(body.car_options);
            if (Array.isArray(body.missing) && body.missing.includes("car")) {
              setNeedsCar(true);
              setMenuOpen(false);
            }
            return;
          }
          setMessage(formatApiError(err));
        },
      }
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.help}>
          Paste or type the job (WhatsApp, email, notes). A pending booking is
          created with no driver. Default times 10:00 to 19:00 and driver pay
          R1000 are used if not given.
        </Text>

        <TextInput
          mode="outlined"
          multiline
          value={text}
          onChangeText={setText}
          placeholder="Paste the job details here"
          style={styles.textBox}
          editable={!mutation.isPending}
          maxLength={8000}
        />

        {needsCar && (
          <Text style={styles.needCar}>Please pick the car for this job.</Text>
        )}
        <Menu
          visible={menuOpen}
          onDismiss={() => setMenuOpen(false)}
          anchor={
            <Button
              mode="outlined"
              icon="car"
              onPress={() => setMenuOpen(true)}
              disabled={mutation.isPending}
              style={styles.carBtn}
            >
              {selectedCar
                ? vehicleLabel(selectedCar)
                : "Car (optional, or name it in the text)"}
            </Button>
          }
        >
          <Menu.Item
            title="No car picked"
            onPress={() => {
              setCarId(null);
              setMenuOpen(false);
            }}
          />
          {cars.map((c) => (
            <Menu.Item
              key={c.id}
              title={vehicleLabel(c)}
              onPress={() => {
                setCarId(c.id);
                setNeedsCar(false);
                setMenuOpen(false);
              }}
            />
          ))}
        </Menu>

        {message && <Text style={styles.error}>{message}</Text>}

        <Button
          mode="contained"
          onPress={submit}
          loading={mutation.isPending}
          disabled={mutation.isPending || !text.trim()}
          style={styles.submit}
          contentStyle={styles.submitContent}
        >
          {mutation.isPending ? "Reading the job..." : "Create booking"}
        </Button>
        {mutation.isPending && (
          <View>
            <Text style={styles.wait}>This can take up to a minute.</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },
  help: { color: colors.muted, fontSize: 13, marginBottom: 12 },
  textBox: { minHeight: 220, backgroundColor: colors.surface },
  carBtn: { marginTop: 14, alignSelf: "stretch" },
  needCar: { color: colors.bookedText, marginTop: 14, fontWeight: "600" },
  error: { color: colors.bookedText, marginTop: 14 },
  submit: { marginTop: 18, backgroundColor: colors.primary },
  submitContent: { paddingVertical: 6 },
  wait: { color: colors.muted, textAlign: "center", marginTop: 10 },
});
