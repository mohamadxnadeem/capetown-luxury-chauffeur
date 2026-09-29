import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useVehiclesAvailable } from "@/hooks/useBookings";
import type { VehicleAvailabilityEntry } from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { ShimmerImage } from "@/components/ShimmerImage";
import { calendarTheme, colors } from "@/theme";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Every date the search range spans — used to pre-fill the booking form.
function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default function VehicleSearchScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const today = isoDate(new Date());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [picking, setPicking] = useState<"start" | "end" | null>(null);
  // Only set once "Search" is tapped — drives the query.
  const [searched, setSearched] = useState<{ start: string; end: string } | null>(
    null
  );

  const query = useVehiclesAvailable(searched?.start, searched?.end);

  function runSearch() {
    setSearched({ start: startDate, end: endDate });
  }

  function pickDate(iso: string) {
    if (picking === "start") {
      setStartDate(iso);
      if (iso > endDate) setEndDate(iso);
    } else if (picking === "end") {
      setEndDate(iso);
      if (iso < startDate) setStartDate(iso);
    }
    setPicking(null);
  }

  function bookVehicle(vehicleId: number) {
    if (!searched) return;
    navigation.navigate("NewBooking", {
      vehicleId,
      dates: datesBetween(searched.start, searched.end),
    });
  }

  const available = query.data?.available_vehicles ?? [];
  const unavailable = query.data?.unavailable_vehicles ?? [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>AVAILABILITY SEARCH</Text>
      <Text style={styles.title}>Find a free vehicle</Text>
      <Text style={styles.subtitle}>
        Pick the dates you need, then search.
      </Text>

      <View style={styles.dateRow}>
        <DateField
          label="From"
          value={startDate}
          onPress={() => setPicking("start")}
        />
        <View style={styles.arrow}>
          <Text style={styles.arrowText}>→</Text>
        </View>
        <DateField
          label="To"
          value={endDate}
          onPress={() => setPicking("end")}
        />
      </View>

      <Button
        mode="contained"
        onPress={runSearch}
        style={styles.searchButton}
        contentStyle={styles.searchButtonContent}
        labelStyle={styles.searchButtonLabel}
        icon="magnify"
      >
        Search
      </Button>

      {query.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {query.error ? (
        <Text style={styles.errorText}>
          Couldn't run the search. Check your connection and try again.
        </Text>
      ) : null}

      {searched && query.data ? (
        <>
          <Text style={styles.resultLabel}>
            AVAILABLE · {available.length}
          </Text>
          {available.length === 0 ? (
            <Text style={styles.muted}>
              No vehicles free for those dates.
            </Text>
          ) : (
            available.map((entry) => (
              <VehicleResultCard
                key={entry.vehicle.id}
                entry={entry}
                onPress={() => bookVehicle(entry.vehicle.id)}
              />
            ))
          )}

          {unavailable.length > 0 ? (
            <>
              <Text style={[styles.resultLabel, { marginTop: 20 }]}>
                FLAGGED · {unavailable.length}
              </Text>
              <Text style={styles.flaggedHint}>
                The backend flagged these — usually a date clash. You can
                still tap to book; it'll be rejected only if there's a real
                time conflict.
              </Text>
              {unavailable.map((entry) => (
                <VehicleResultCard
                  key={entry.vehicle.id}
                  entry={entry}
                  flagged
                  onPress={() => bookVehicle(entry.vehicle.id)}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}

      <DatePickerModal
        visible={picking !== null}
        title={picking === "start" ? "From date" : "To date"}
        initialDate={picking === "start" ? startDate : endDate}
        minDate={picking === "end" ? startDate : today}
        onDismiss={() => setPicking(null)}
        onPick={pickDate}
      />
    </ScrollView>
  );
}

function VehicleResultCard({
  entry,
  onPress,
  flagged,
}: {
  entry: VehicleAvailabilityEntry;
  onPress?: () => void;
  flagged?: boolean;
}) {
  const v = entry.vehicle;
  const cover =
    v.cover_photos?.find((p) => p.is_featured)?.cover_photos ??
    v.cover_photos?.[0]?.cover_photos;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.card, flagged && styles.cardFlagged]}
    >
      <ShimmerImage
        uri={cover}
        style={styles.cardImage}
        fallback={
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Text style={styles.cardImageInitial}>{v.title[0] ?? "?"}</Text>
          </View>
        }
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {v.title}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {v.registration_number || v.vehicle_type}
          {entry.driver?.full_name ? `  ·  ${entry.driver.full_name}` : ""}
        </Text>
        {flagged && entry.reason ? (
          <Text style={styles.cardReason} numberOfLines={2}>
            {entry.reason}
          </Text>
        ) : (
          <Text style={styles.cardPrice}>R {v.price} / day</Text>
        )}
      </View>
      <Text style={styles.cardChevron}>›</Text>
    </TouchableOpacity>
  );
}

function DateField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.dateField}
    >
      <Text style={styles.dateFieldLabel}>{label}</Text>
      <Text style={styles.dateFieldValue}>{prettyDate(value)}</Text>
    </TouchableOpacity>
  );
}

function DatePickerModal({
  visible,
  title,
  initialDate,
  minDate,
  onDismiss,
  onPick,
}: {
  visible: boolean;
  title: string;
  initialDate: string;
  minDate?: string;
  onDismiss: () => void;
  onPick: (iso: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.modalRoot} edges={["top"]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onDismiss} hitSlop={8}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={styles.modalContent}>
          <View style={styles.modalCalendarShell}>
            <Calendar
              current={initialDate}
              minDate={minDate}
              markedDates={{
                [initialDate]: {
                  selected: true,
                  selectedColor: colors.primary,
                },
              }}
              onDayPress={(d: DateData) => onPick(d.dateString)}
              theme={calendarTheme}
              enableSwipeMonths
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 32 },
  eyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  title: {
    color: colors.heading,
    fontSize: 26,
    fontWeight: "800",
    marginTop: 2,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4, marginBottom: 16 },

  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  arrow: { paddingHorizontal: 2 },
  arrowText: { color: colors.muted, fontSize: 16, fontWeight: "700" },
  dateField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateFieldLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  dateFieldValue: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },

  searchButton: { marginTop: 14, borderRadius: 14 },
  searchButtonContent: { height: 50 },
  searchButtonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },

  center: { padding: 32, alignItems: "center" },
  errorText: { color: "#b03b3b", fontSize: 13, marginTop: 16 },
  muted: { color: colors.muted, marginTop: 4 },

  resultLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 22,
    marginBottom: 10,
  },
  flaggedHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  cardFlagged: { borderColor: "#e3c1c1", backgroundColor: "#fbf2f2" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardDisabled: { opacity: 0.55 },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  cardImageFallback: { alignItems: "center", justifyContent: "center" },
  cardImageInitial: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  cardBody: { flex: 1, marginLeft: 12 },
  cardTitle: { color: colors.heading, fontSize: 16, fontWeight: "700" },
  cardMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  cardPrice: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  cardReason: {
    color: "#b03b3b",
    fontSize: 12,
    marginTop: 4,
    fontStyle: "italic",
  },
  cardChevron: { color: colors.muted, fontSize: 24, marginLeft: 6 },

  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalCancel: { color: colors.muted, fontWeight: "600", fontSize: 15 },
  modalTitle: { color: colors.heading, fontWeight: "800", fontSize: 16 },
  modalContent: { padding: 16 },
  modalCalendarShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
});
