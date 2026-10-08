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
import { Calendar, DateData } from "react-native-calendars";
import type {
  CreateBookingDayPayload,
  CreateBookingGroupChildPayload,
  DayType,
  DriverNested,
  Vehicle,
} from "@/api/types";
import { calendarTheme, colors } from "@/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  // Dates to pre-select on the calendar when the sheet opens. Operator can
  // deselect them and pick different ones — this is the only mechanism
  // for the new vehicle to use dates that differ from the parent booking.
  defaultDates?: string[];
  defaultDayType?: DayType;
  // Pre-fills the single start/end time inputs. Null falls back to
  // 09:00 / 17:00.
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  defaultPickupLocation?: string | null;
  defaultDropoffLocation?: string | null;
  // Vehicle IDs already used elsewhere in this booking/group — excluded
  // from the picker so the operator can't double-pick the same vehicle.
  excludeVehicleIds?: number[];
  vehicles: Vehicle[];
  drivers: DriverNested[];
  submitting: boolean;
  onSubmit: (child: CreateBookingGroupChildPayload) => Promise<void>;
  // UI customisation — defaults are suitable for the "add vehicle"
  // use case; override for conversion flows etc.
  heading?: string;
  description?: string;
  submitLabel?: string;
}

// ---- Helpers ------------------------------------------------------------

function timeForApi(hhmm: string): string | null {
  const t = hhmm.trim();
  if (!t) return null;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

function isOvernightShift(startTime: string, endTime: string): boolean {
  const start = timeForApi(startTime);
  const end = timeForApi(endTime);
  if (!start || !end) return false;
  return end < start;
}

function hhmmFromServer(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Shared sheet for "add vehicle to a booking/group" flows. Used by:
//   - BookingDetailScreen (converts a standalone booking into a group
//     by attaching this new vehicle as the second child).
//   - BookingGroupDetailScreen (attaches this new vehicle as the next
//     child of an existing group).
// The parent is responsible for calling the right API in onSubmit — this
// component just collects the operator's input into a
// CreateBookingGroupChildPayload.
export function AddVehicleSheet({
  visible,
  onClose,
  defaultDates = [],
  defaultDayType = "full_day",
  defaultStartTime,
  defaultEndTime,
  defaultPickupLocation,
  defaultDropoffLocation,
  excludeVehicleIds = [],
  vehicles,
  drivers,
  submitting,
  onSubmit,
  heading = "Add another vehicle",
  description,
  submitLabel = "Add to proposal",
}: Props) {
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>(defaultDates);
  const [startTime, setStartTime] = useState(
    hhmmFromServer(defaultStartTime) || "09:00"
  );
  const [endTime, setEndTime] = useState(
    hhmmFromServer(defaultEndTime) || "17:00"
  );
  const [clientRate, setClientRate] = useState("");
  const [driverRate, setDriverRate] = useState("");
  const [pickupOverride, setPickupOverride] = useState("");
  const [dropoffOverride, setDropoffOverride] = useState("");
  const [notesOverride, setNotesOverride] = useState("");
  // Inline expand/collapse. Paper's Menu renders through a Portal that
  // sits BELOW native Modals, so an inline list is the reliable choice.
  const [vehicleListOpen, setVehicleListOpen] = useState(false);
  const [driverListOpen, setDriverListOpen] = useState(false);

  // Reset state whenever the sheet opens so the operator starts fresh.
  useEffect(() => {
    if (!visible) return;
    setVehicleId(null);
    setDriverId(null);
    setSelectedDates(defaultDates);
    setStartTime(hhmmFromServer(defaultStartTime) || "09:00");
    setEndTime(hhmmFromServer(defaultEndTime) || "17:00");
    setClientRate("");
    setDriverRate("");
    setPickupOverride("");
    setDropoffOverride("");
    setNotesOverride("");
    setVehicleListOpen(false);
    setDriverListOpen(false);
    // Intentionally depending ONLY on `visible` — defaults are
    // snapshotted at open-time and should not re-apply mid-session as
    // the operator types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const selectedDriver = drivers.find((d) => d.id === driverId);
  const excluded = useMemo(
    () => new Set(excludeVehicleIds),
    [excludeVehicleIds]
  );
  const availableVehicles = useMemo(
    () => vehicles.filter((v) => v.is_active && !excluded.has(v.id)),
    [vehicles, excluded]
  );

  function pickVehicle(v: Vehicle) {
    setVehicleId(v.id);
    setClientRate((r) => (r ? r : v.price ?? ""));
    setDriverRate((r) => (r ? r : v.driver?.default_daily_rate ?? ""));
    setDriverId((cur) => (cur == null ? v.driver?.id ?? null : cur));
    setVehicleListOpen(false);
  }

  function toggleDate(d: DateData) {
    const date = d.dateString;
    setSelectedDates((cur) =>
      cur.includes(date)
        ? cur.filter((x) => x !== date)
        : [...cur, date].sort()
    );
  }

  const markedDates = useMemo(() => {
    const m: Record<string, { customStyles: object }> = {};
    for (const d of selectedDates) {
      m[d] = {
        customStyles: {
          container: { backgroundColor: colors.primary, borderRadius: 8 },
          text: { color: colors.onPrimary, fontWeight: "700" },
        },
      };
    }
    return m;
  }, [selectedDates]);

  const overnight = isOvernightShift(startTime, endTime);
  const dayCount = selectedDates.length;
  const clientRateNum = parseFloat(clientRate);
  const totalClient =
    !isNaN(clientRateNum) && dayCount > 0 ? clientRateNum * dayCount : 0;

  async function handleConfirm() {
    if (vehicleId == null) {
      Alert.alert("Pick a vehicle first.");
      return;
    }
    if (selectedDates.length === 0) {
      Alert.alert("Pick at least one date for this vehicle.");
      return;
    }
    if (!timeForApi(startTime)) {
      Alert.alert("Enter a valid start time (HH:MM).");
      return;
    }
    if (!timeForApi(endTime)) {
      Alert.alert("Enter a valid end time (HH:MM).");
      return;
    }
    const driverRateNum = parseFloat(driverRate);
    if (isNaN(clientRateNum) || clientRateNum <= 0) {
      Alert.alert("Enter a valid client rate.");
      return;
    }
    if (isNaN(driverRateNum) || driverRateNum < 0) {
      Alert.alert("Enter a valid driver rate.");
      return;
    }

    const days: CreateBookingDayPayload[] = selectedDates.map((date) => ({
      date,
      day_type: defaultDayType,
      start_time: timeForApi(startTime),
      end_time: timeForApi(endTime),
      end_next_day: overnight,
      notes: null,
      client_rate: clientRateNum.toFixed(2),
      driver_rate: driverRateNum.toFixed(2),
      driver_payment_status: "unpaid",
    }));

    const child: CreateBookingGroupChildPayload = {
      car: vehicleId,
      driver: driverId,
      pickup_location:
        pickupOverride.trim() || defaultPickupLocation || "",
      dropoff_location:
        dropoffOverride.trim() || defaultDropoffLocation || "",
      trip_description: notesOverride.trim(),
      days,
    };

    await onSubmit(child);
  }

  function handleClose() {
    if (submitting) return;
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
        style={styles.sheetOverlay}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.sheetBackdrop}
          onPress={handleClose}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sheetTitle}>{heading}</Text>
            {description ? (
              <Text style={styles.sheetSub}>{description}</Text>
            ) : null}

            <Text style={styles.sheetLabel}>Vehicle</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setVehicleListOpen((v) => !v)}
              style={styles.sheetPickerRow}
            >
              <Text
                style={[
                  styles.sheetPickerRowText,
                  !selectedVehicle && styles.sheetPickerRowTextMuted,
                ]}
              >
                {selectedVehicle ? selectedVehicle.title : "Choose a vehicle"}
              </Text>
              <Text style={styles.sheetPickerChevron}>
                {vehicleListOpen ? "▴" : "▾"}
              </Text>
            </TouchableOpacity>
            {vehicleListOpen ? (
              <View style={styles.sheetInlineList}>
                {availableVehicles.length === 0 ? (
                  <Text style={styles.sheetInlineEmpty}>
                    No other vehicles available.
                  </Text>
                ) : (
                  availableVehicles.map((v) => {
                    const active = vehicleId === v.id;
                    return (
                      <TouchableOpacity
                        key={v.id}
                        onPress={() => pickVehicle(v)}
                        activeOpacity={0.85}
                        style={[
                          styles.sheetInlineOption,
                          active && styles.sheetInlineOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sheetInlineOptionText,
                            active && styles.sheetInlineOptionTextActive,
                          ]}
                        >
                          {v.title}
                        </Text>
                        {active ? (
                          <Text style={styles.sheetInlineOptionCheck}>✓</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : null}

            <Text style={styles.sheetLabel}>Driver</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setDriverListOpen((v) => !v)}
              style={styles.sheetPickerRow}
            >
              <Text
                style={[
                  styles.sheetPickerRowText,
                  !selectedDriver && styles.sheetPickerRowTextMuted,
                ]}
              >
                {selectedDriver
                  ? selectedDriver.full_name
                  : "No driver assigned"}
              </Text>
              <Text style={styles.sheetPickerChevron}>
                {driverListOpen ? "▴" : "▾"}
              </Text>
            </TouchableOpacity>
            {driverListOpen ? (
              <View style={styles.sheetInlineList}>
                <TouchableOpacity
                  onPress={() => {
                    setDriverId(null);
                    setDriverListOpen(false);
                  }}
                  activeOpacity={0.85}
                  style={[
                    styles.sheetInlineOption,
                    driverId == null && styles.sheetInlineOptionActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetInlineOptionText,
                      driverId == null && styles.sheetInlineOptionTextActive,
                    ]}
                  >
                    No driver assigned
                  </Text>
                  {driverId == null ? (
                    <Text style={styles.sheetInlineOptionCheck}>✓</Text>
                  ) : null}
                </TouchableOpacity>
                {drivers.map((d) => {
                  const active = driverId === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => {
                        setDriverId(d.id);
                        setDriverListOpen(false);
                      }}
                      activeOpacity={0.85}
                      style={[
                        styles.sheetInlineOption,
                        active && styles.sheetInlineOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sheetInlineOptionText,
                          active && styles.sheetInlineOptionTextActive,
                        ]}
                      >
                        {d.full_name}
                      </Text>
                      {active ? (
                        <Text style={styles.sheetInlineOptionCheck}>✓</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* Dates — pre-filled from the parent booking's days (if any)
                so "same days as the primary" is one tap away. Operator
                can deselect and pick different dates for this vehicle. */}
            <Text style={styles.sheetLabel}>Dates for this vehicle</Text>
            <View style={styles.sheetCalendarShell}>
              <Calendar
                markedDates={markedDates}
                markingType="custom"
                onDayPress={toggleDate}
                theme={calendarTheme}
                enableSwipeMonths
              />
            </View>
            {selectedDates.length > 0 ? (
              <View style={styles.sheetChipRow}>
                {selectedDates.map((d) => (
                  <TouchableOpacity
                    key={d}
                    onPress={() =>
                      setSelectedDates((cur) =>
                        cur.filter((x) => x !== d)
                      )
                    }
                    activeOpacity={0.85}
                    style={styles.sheetDateChip}
                  >
                    <Text style={styles.sheetDateChipText}>
                      {prettyDate(d)}  ✕
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.sheetHint}>
                Tap dates on the calendar to add them.
              </Text>
            )}

            {/* Single start/end applied to every selected date. Operator
                can tweak per-day after creation by opening the child
                booking's edit screen. */}
            <View style={[styles.sheetRatesRow, { marginTop: 12 }]}>
              <TextInput
                label="Start (HH:MM)"
                value={startTime}
                onChangeText={setStartTime}
                mode="outlined"
                autoCapitalize="none"
                style={styles.sheetRateInput}
              />
              <TextInput
                label="End (HH:MM)"
                value={endTime}
                onChangeText={setEndTime}
                mode="outlined"
                autoCapitalize="none"
                style={styles.sheetRateInput}
              />
            </View>
            {overnight ? (
              <Text style={styles.sheetOvernight}>
                🌙 Overnight shift — ends the next morning
              </Text>
            ) : null}

            <View style={[styles.sheetRatesRow, { marginTop: 8 }]}>
              <TextInput
                label="Client rate (R / day)"
                value={clientRate}
                onChangeText={setClientRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.sheetRateInput}
              />
              <TextInput
                label="Driver rate (R / day)"
                value={driverRate}
                onChangeText={setDriverRate}
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.sheetRateInput}
              />
            </View>

            {dayCount > 0 && totalClient > 0 ? (
              <Text style={styles.sheetHint}>
                × {dayCount} {dayCount === 1 ? "day" : "days"} = R{" "}
                {totalClient.toFixed(2)} total for this vehicle
              </Text>
            ) : null}

            <TextInput
              label="Pickup (optional override)"
              value={pickupOverride}
              onChangeText={setPickupOverride}
              mode="outlined"
              style={[styles.sheetOverrideInput, { marginTop: 10 }]}
              placeholder={defaultPickupLocation ?? undefined}
            />
            <TextInput
              label="Dropoff (optional override)"
              value={dropoffOverride}
              onChangeText={setDropoffOverride}
              mode="outlined"
              style={styles.sheetOverrideInput}
              placeholder={defaultDropoffLocation ?? undefined}
            />
            <TextInput
              label="Notes for this vehicle (optional)"
              value={notesOverride}
              onChangeText={setNotesOverride}
              mode="outlined"
              multiline
              numberOfLines={2}
              style={styles.sheetOverrideInput}
              placeholder="e.g. Second car for luggage / larger group"
            />

            <View style={styles.sheetActionsRow}>
              <Button
                mode="text"
                onPress={handleClose}
                disabled={submitting}
                textColor={colors.muted}
                style={styles.sheetActionButton}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleConfirm}
                loading={submitting}
                disabled={
                  submitting ||
                  vehicleId == null ||
                  selectedDates.length === 0
                }
                buttonColor={colors.primary}
                textColor={colors.onPrimary}
                style={styles.sheetActionButton}
                icon="check"
              >
                {submitLabel}
              </Button>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheetBackdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    paddingTop: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetContent: { padding: 20, paddingBottom: 32 },
  sheetTitle: {
    color: colors.heading,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  sheetSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  sheetLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 6,
  },
  sheetPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sheetPickerRowText: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  sheetPickerRowTextMuted: { color: colors.muted, fontWeight: "500" },
  sheetPickerChevron: {
    color: colors.muted,
    fontSize: 14,
    marginLeft: 10,
  },
  sheetInlineList: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
  },
  sheetInlineEmpty: {
    padding: 12,
    color: colors.muted,
    fontSize: 13,
    fontStyle: "italic",
  },
  sheetInlineOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetInlineOptionActive: { backgroundColor: "rgba(11,91,51,0.1)" },
  sheetInlineOptionText: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "600",
  },
  sheetInlineOptionTextActive: { color: colors.primary, fontWeight: "800" },
  sheetInlineOptionCheck: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
  },
  sheetCalendarShell: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginTop: 2,
  },
  sheetChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  sheetDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetDateChipText: {
    color: colors.heading,
    fontSize: 12,
    fontWeight: "700",
  },
  sheetRatesRow: { flexDirection: "row", gap: 10 },
  sheetRateInput: { flex: 1, backgroundColor: colors.surface },
  sheetOverrideInput: { marginTop: 8, backgroundColor: colors.surface },
  sheetHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    fontStyle: "italic",
  },
  sheetOvernight: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sheetActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
    gap: 10,
  },
  sheetActionButton: { borderRadius: 12 },
});
