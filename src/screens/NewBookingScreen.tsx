import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  Menu,
  Text,
  TextInput,
} from "react-native-paper";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useAdminBooking,
  useBookingFormOptions,
  useCreateBooking,
  useUpdateBooking,
  useVehicleBookedSlots,
  useVehicleUnavailableDates,
} from "@/hooks/useBookings";
import type { BookedSlot } from "@/api/bookings";
import type {
  Booking,
  CreateBookingDayPayload,
  CreateBookingPayload,
  DayType,
  Vehicle,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { formatApiError } from "@/api/errors";
import { calendarTheme, colors } from "@/theme";

// Per-day record: each selected date carries its own schedule, description,
// and pricing. Rates default to the vehicle's standard daily rate when the
// day is added; the operator can override per day.
interface DayDetail {
  startTime: string; // HH:MM
  endTime: string; // HH:MM, optional
  notes: string; // per-day description
  clientRate: string; // R/day for the client (pre-fills from vehicle.price)
  driverRate: string; // R/day for the driver (pre-fills from driver.default_daily_rate)
}

function newDayDetail(defaults?: {
  clientRate?: string;
  driverRate?: string;
}): DayDetail {
  return {
    startTime: "09:00",
    endTime: "",
    notes: "",
    clientRate: defaults?.clientRate ?? "",
    driverRate: defaults?.driverRate ?? "",
  };
}

interface FormState {
  vehicleId: number | null;
  // null means "use the vehicle's default driver" — the backend will fall back
  // to vehicle.driver. Set explicitly when the operator picks a driver
  // override OR when the vehicle has no default and we need to fill the gap.
  driverId: number | null;
  selectedDates: string[]; // YYYY-MM-DD, sorted
  // Per-date schedule + rates, keyed by the date string. Kept in sync with
  // selectedDates — an entry is added when a date is picked, removed when
  // deselected.
  dayDetails: Record<string, DayDetail>;
  dayType: DayType;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  title: string;
  pickupLocation: string;
  dropoffLocation: string;
  tripDescription: string;
}

const EMPTY_FORM: FormState = {
  vehicleId: null,
  driverId: null,
  selectedDates: [],
  dayDetails: {},
  dayType: "full_day",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  title: "",
  pickupLocation: "",
  dropoffLocation: "",
  tripDescription: "",
};

// "2026-06-12" → "Fri, 12 Jun"
function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Format "09:00" → "09:00:00" for the API; empty string → null.
function timeForApi(hhmm: string): string | null {
  const t = hhmm.trim();
  if (!t) return null;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

// Build the editable form state from an existing booking (edit mode).
function bookingToForm(b: Booking): FormState {
  const days = b.days ?? [];
  const dayDetails: Record<string, DayDetail> = {};
  for (const d of days) {
    dayDetails[d.date] = {
      startTime: d.start_time ? d.start_time.slice(0, 5) : "",
      endTime: d.end_time ? d.end_time.slice(0, 5) : "",
      notes: d.notes ?? "",
      clientRate: d.client_rate ?? "",
      driverRate: d.driver_rate ?? "",
    };
  }
  const first = days[0];
  return {
    vehicleId: b.car?.id ?? null,
    driverId: b.driver?.id ?? null,
    selectedDates: days.map((d) => d.date).sort(),
    dayDetails,
    dayType: first?.day_type ?? "full_day",
    customerName: b.customer_name ?? "",
    customerPhone: b.customer_phone ?? "",
    customerEmail: b.customer_email ?? "",
    title: b.title ?? "",
    pickupLocation: b.pickup_location ?? "",
    dropoffLocation: b.dropoff_location ?? "",
    tripDescription: b.trip_description ?? "",
  };
}

export default function NewBookingScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  // The "New" tab may pass { vehicleId }; the "BookingEdit" stack route
  // passes { bookingId }. Read params loosely since the screen serves both.
  const params = route.params as
    | { vehicleId?: number; bookingId?: number; dates?: string[] }
    | undefined;
  const editingId = params?.bookingId;
  const isEdit = editingId != null;

  const optionsQuery = useBookingFormOptions();
  const bookingQuery = useAdminBooking(editingId);
  const createBookingMutation = useCreateBooking();
  const updateBookingMutation = useUpdateBooking(editingId);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [driverMenuOpen, setDriverMenuOpen] = useState(false);

  // Prefill guards — run each one-shot effect only once.
  const prefilledRef = useRef(false);
  const vehiclePreselectedRef = useRef(false);

  const vehicles = optionsQuery.data?.vehicles ?? [];
  const drivers = optionsQuery.data?.drivers ?? [];
  const selectedVehicle: Vehicle | undefined = useMemo(
    () => vehicles.find((v) => v.id === form.vehicleId),
    [vehicles, form.vehicleId]
  );

  // The driver assigned to this booking. form.driverId is the single source
  // of truth — null means "no driver assigned" (allowed; you can assign one
  // later). Picking a vehicle pre-fills it with that vehicle's default driver.
  const effectiveDriver = useMemo(() => {
    if (form.driverId == null) return null;
    return drivers.find((d) => d.id === form.driverId) ?? null;
  }, [form.driverId, drivers]);

  // Edit mode: prefill the whole form from the existing booking, once.
  useEffect(() => {
    if (!isEdit || prefilledRef.current) return;
    if (bookingQuery.data) {
      setForm(bookingToForm(bookingQuery.data));
      prefilledRef.current = true;
    }
  }, [isEdit, bookingQuery.data]);

  // Create mode: pre-select a vehicle and/or dates when opened from
  // VehicleDetail or the availability search via
  // navigation.navigate('Tabs', { screen: 'New', params: { vehicleId, dates } }).
  useEffect(() => {
    if (isEdit || vehiclePreselectedRef.current) return;
    const id = params?.vehicleId;
    const dates = params?.dates;
    if (id == null && (!dates || dates.length === 0)) return;
    if (id != null && vehicles.length === 0) return; // wait for vehicle list

    setForm((f) => {
      const next = { ...f };
      let pickedVehicle: Vehicle | undefined;
      if (id != null) {
        pickedVehicle = vehicles.find((x) => x.id === id);
        if (pickedVehicle) {
          next.vehicleId = pickedVehicle.id;
          next.driverId = pickedVehicle.driver?.id ?? null;
        }
      }
      if (dates && dates.length > 0) {
        // Pre-fill each date's day card with the vehicle's standard rates;
        // the operator can override per day.
        const defaults = {
          clientRate: pickedVehicle?.price ?? "",
          driverRate: pickedVehicle?.driver?.default_daily_rate ?? "",
        };
        next.selectedDates = [...dates].sort();
        next.dayDetails = {};
        for (const d of next.selectedDates) {
          next.dayDetails[d] = newDayDetail(defaults);
        }
      }
      return next;
    });
    vehiclePreselectedRef.current = true;
  }, [isEdit, params?.vehicleId, params?.dates, vehicles]);

  // Query unavailable dates for the currently selected vehicle so we can
  // grey them out on the calendar.
  const unavailableQuery = useVehicleUnavailableDates(
    selectedVehicle?.id,
    undefined,
    undefined
  );
  // Fully-booked dates — greyed and not selectable.
  const unavailableSet = useMemo(() => {
    const all = new Set(unavailableQuery.data?.unavailable ?? []);
    // In edit mode, the booking we're editing already occupies some of these
    // dates — subtract them so the operator can keep / re-pick them freely.
    if (isEdit && bookingQuery.data) {
      for (const d of bookingQuery.data.days ?? []) all.delete(d.date);
    }
    return all;
  }, [unavailableQuery.data, isEdit, bookingQuery.data]);

  // Partially-booked dates — have bookings but free time left, still
  // selectable (the operator picks a non-clashing window).
  const partiallyBookedSet = useMemo(
    () => new Set(unavailableQuery.data?.partiallyBooked ?? []),
    [unavailableQuery.data]
  );

  // A vehicle's booked time windows, so each day card can show what's
  // already taken and the operator can pick a free gap.
  const bookedSlotsQuery = useVehicleBookedSlots(selectedVehicle?.id);
  const bookedSlotsByDate = useMemo(() => {
    const m: Record<string, BookedSlot[]> = {};
    for (const slot of bookedSlotsQuery.data ?? []) {
      (m[slot.date] ??= []).push(slot);
    }
    return m;
  }, [bookedSlotsQuery.data]);

  // Calendar markings:
  //   fully booked  → coral, disabled
  //   partly booked → amber, still selectable
  //   selected      → emerald
  const markedDates = useMemo(() => {
    const m: Record<
      string,
      {
        disabled?: boolean;
        disableTouchEvent?: boolean;
        customStyles?: { container: object; text: object };
      }
    > = {};
    for (const d of partiallyBookedSet) {
      m[d] = {
        customStyles: {
          container: { backgroundColor: colors.partialBg, borderRadius: 8 },
          text: { color: colors.partialText, fontWeight: "600" },
        },
      };
    }
    for (const d of unavailableSet) {
      m[d] = {
        disabled: true,
        disableTouchEvent: true,
        customStyles: {
          container: { backgroundColor: colors.bookedBg, borderRadius: 8 },
          text: { color: colors.bookedText, fontWeight: "600" },
        },
      };
    }
    // Selected dates take precedence — overwrite.
    for (const d of form.selectedDates) {
      m[d] = {
        customStyles: {
          container: { backgroundColor: colors.primary, borderRadius: 8 },
          text: { color: colors.onPrimary, fontWeight: "700" },
        },
      };
    }
    return m;
  }, [unavailableSet, partiallyBookedSet, form.selectedDates]);

  function pickVehicle(v: Vehicle) {
    setVehicleMenuOpen(false);
    setForm((f) => {
      const defaults = {
        clientRate: v.price ?? "",
        driverRate: v.driver?.default_daily_rate ?? "",
      };
      // Existing day rates carry over (operator might have already customised
      // them). Fill ONLY days with no rate yet from the new vehicle's defaults.
      const dayDetails: Record<string, DayDetail> = {};
      for (const date of f.selectedDates) {
        const existing = f.dayDetails[date];
        if (existing) {
          dayDetails[date] = {
            ...existing,
            clientRate: existing.clientRate || defaults.clientRate,
            driverRate: existing.driverRate || defaults.driverRate,
          };
        } else {
          dayDetails[date] = newDayDetail(defaults);
        }
      }
      return {
        ...f,
        vehicleId: v.id,
        // Pre-fill the vehicle's default driver (if any). Operator can change
        // it or clear it to "No driver" in the picker.
        driverId: v.driver?.id ?? null,
        dayDetails,
      };
    });
  }

  function pickDriver(driverId: number | null) {
    setDriverMenuOpen(false);
    setForm((f) => ({ ...f, driverId }));
  }

  function toggleDate(d: DateData) {
    if (unavailableSet.has(d.dateString)) return; // belt-and-braces
    const date = d.dateString;
    setForm((f) => {
      const has = f.selectedDates.includes(date);
      if (has) {
        const nextDetails = { ...f.dayDetails };
        delete nextDetails[date];
        return {
          ...f,
          selectedDates: f.selectedDates.filter((x) => x !== date),
          dayDetails: nextDetails,
        };
      }
      return {
        ...f,
        selectedDates: [...f.selectedDates, date].sort(),
        dayDetails: {
          ...f.dayDetails,
          [date]: newDayDetail({
            clientRate: selectedVehicle?.price ?? "",
            driverRate: selectedVehicle?.driver?.default_daily_rate ?? "",
          }),
        },
      };
    });
  }

  function removeDate(date: string) {
    setForm((f) => {
      const nextDetails = { ...f.dayDetails };
      delete nextDetails[date];
      return {
        ...f,
        selectedDates: f.selectedDates.filter((x) => x !== date),
        dayDetails: nextDetails,
      };
    });
  }

  function clearDates() {
    setForm((f) => ({ ...f, selectedDates: [], dayDetails: {} }));
  }

  // Patch a single day's schedule entry.
  function updateDayDetail(date: string, patch: Partial<DayDetail>) {
    setForm((f) => ({
      ...f,
      dayDetails: {
        ...f.dayDetails,
        [date]: { ...(f.dayDetails[date] ?? newDayDetail()), ...patch },
      },
    }));
  }

  // Copy the first selected day's schedule onto every other day — handy when
  // a multi-day booking runs the same hours each day.
  function copyFirstDayToAll() {
    setForm((f) => {
      const first = f.selectedDates[0];
      if (!first) return f;
      const template = f.dayDetails[first] ?? newDayDetail();
      const nextDetails: Record<string, DayDetail> = {};
      for (const d of f.selectedDates) nextDetails[d] = { ...template };
      return { ...f, dayDetails: nextDetails };
    });
  }

  function validate(): string | null {
    if (form.vehicleId == null) return "Pick a vehicle.";
    if (form.selectedDates.length === 0) return "Select at least one date.";
    // Driver is optional — a booking can be created unassigned and a driver
    // attached later.
    if (!form.customerName.trim()) return "Customer name is required.";
    // Start + end time are required on every day so time-window conflict
    // detection is meaningful.
    for (const date of form.selectedDates) {
      const detail = form.dayDetails[date];
      if (!detail || !timeForApi(detail.startTime)) {
        return `Enter a start time (HH:MM) for ${prettyDate(date)}.`;
      }
      if (!timeForApi(detail.endTime)) {
        return `Enter an end time (HH:MM) for ${prettyDate(date)}.`;
      }
      if (!detail.clientRate.trim() || isNaN(parseFloat(detail.clientRate))) {
        return `Enter a valid client rate for ${prettyDate(date)}.`;
      }
      if (!detail.driverRate.trim() || isNaN(parseFloat(detail.driverRate))) {
        return `Enter a valid driver rate for ${prettyDate(date)}.`;
      }
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      Alert.alert(
        isEdit ? "Can't save changes yet" : "Can't create booking yet",
        err
      );
      return;
    }
    const days: CreateBookingDayPayload[] = form.selectedDates.map((date) => {
      const detail = form.dayDetails[date] ?? newDayDetail();
      return {
        date,
        day_type: form.dayType,
        start_time: timeForApi(detail.startTime),
        end_time: timeForApi(detail.endTime),
        notes: detail.notes.trim() || null,
        client_rate: parseFloat(detail.clientRate).toFixed(2),
        driver_rate: parseFloat(detail.driverRate).toFixed(2),
        driver_payment_status: "unpaid",
      };
    });

    const payload: CreateBookingPayload = {
      car: form.vehicleId!,
      title: form.title.trim() || form.customerName.trim(),
      customer_name: form.customerName.trim(),
      customer_email: form.customerEmail.trim(),
      customer_phone: form.customerPhone.trim(),
      pickup_location: form.pickupLocation.trim(),
      dropoff_location: form.dropoffLocation.trim(),
      trip_description: form.tripDescription.trim(),
      status: "pending",
      days,
      // Send driver only when explicitly overridden. Otherwise let the
      // backend use the vehicle's default driver.
      // Always send driver explicitly — null means "no driver assigned",
      // which the backend accepts (driver is a nullable FK).
      driver: form.driverId,
    };

    try {
      if (isEdit) {
        await updateBookingMutation.mutateAsync(payload);
        Alert.alert("Changes saved", "The booking has been updated.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      } else {
        const booking = await createBookingMutation.mutateAsync(payload);
        Alert.alert(
          "Booking created",
          `Reference: ${booking.booking_reference}`,
          [
            {
              text: "View",
              onPress: () =>
                navigation.navigate("BookingDetail", {
                  bookingId: booking.id,
                }),
            },
            {
              text: "New booking",
              style: "cancel",
              onPress: () => setForm(EMPTY_FORM),
            },
          ]
        );
      }
    } catch (err: unknown) {
      Alert.alert(
        isEdit ? "Couldn't save changes" : "Couldn't create booking",
        formatApiError(err)
      );
    }
  }

  if (optionsQuery.isLoading || (isEdit && bookingQuery.isLoading)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (optionsQuery.error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted, marginBottom: 12 }}>
          Couldn't load the form. Check your connection.
        </Text>
        <Button mode="outlined" onPress={() => optionsQuery.refetch()}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- Vehicle ---- */}
        <Section title="Vehicle">
          <Menu
            visible={vehicleMenuOpen}
            onDismiss={() => setVehicleMenuOpen(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setVehicleMenuOpen(true)}
                style={styles.vehicleButton}
                contentStyle={styles.vehicleButtonContent}
              >
                {selectedVehicle ? selectedVehicle.title : "Choose a vehicle"}
              </Button>
            }
          >
            {vehicles
              .filter((v) => v.is_active)
              .map((v) => (
                <Menu.Item
                  key={v.id}
                  onPress={() => pickVehicle(v)}
                  title={`${v.title}${v.registration_number ? `  ·  ${v.registration_number}` : ""}`}
                />
              ))}
          </Menu>
          {selectedVehicle ? (
            <View style={styles.vehicleMeta}>
              <Text style={styles.metaLabel}>Driver</Text>
              <Menu
                visible={driverMenuOpen}
                onDismiss={() => setDriverMenuOpen(false)}
                anchor={
                  <Button
                    mode="outlined"
                    onPress={() => setDriverMenuOpen(true)}
                    style={styles.driverPickerButton}
                    contentStyle={styles.driverPickerButtonContent}
                    textColor={effectiveDriver ? colors.heading : colors.muted}
                  >
                    {effectiveDriver
                      ? effectiveDriver.full_name
                      : "No driver assigned"}
                  </Button>
                }
              >
                <Menu.Item
                  onPress={() => pickDriver(null)}
                  title="No driver assigned"
                  leadingIcon={form.driverId == null ? "check" : undefined}
                />
                {drivers.map((d) => (
                  <Menu.Item
                    key={d.id}
                    onPress={() => pickDriver(d.id)}
                    title={d.full_name}
                    leadingIcon={
                      form.driverId === d.id ? "check" : undefined
                    }
                  />
                ))}
              </Menu>
              <Text style={[styles.metaLabel, { marginTop: 10 }]}>Rate</Text>
              <Text style={styles.metaValue}>R {selectedVehicle.price} / day</Text>
            </View>
          ) : null}
        </Section>

        {/* ---- Dates ---- */}
        <Section
          title="Dates"
          right={
            form.selectedDates.length > 0 ? (
              <Button compact onPress={clearDates} textColor={colors.muted}>
                Clear
              </Button>
            ) : null
          }
        >
          {selectedVehicle ? (
            <>
              <View style={styles.calendarShell}>
                <Calendar
                  markedDates={markedDates}
                  markingType="custom"
                  onDayPress={toggleDate}
                  theme={calendarTheme}
                  enableSwipeMonths
                  minDate={new Date().toISOString().slice(0, 10)}
                />
              </View>
              {unavailableQuery.isLoading ? (
                <HelperText type="info" style={styles.helper}>
                  Loading vehicle availability…
                </HelperText>
              ) : null}
              {form.selectedDates.length > 0 ? (
                <View style={styles.chipRow}>
                  {form.selectedDates.map((d) => (
                    <Chip
                      key={d}
                      onClose={() =>
                        setForm((f) => ({
                          ...f,
                          selectedDates: f.selectedDates.filter((x) => x !== d),
                        }))
                      }
                      style={styles.chip}
                      textStyle={styles.chipText}
                    >
                      {d}
                    </Chip>
                  ))}
                </View>
              ) : (
                <HelperText type="info" style={styles.helper}>
                  Tap dates to add them. Greyed dates are already booked.
                </HelperText>
              )}
            </>
          ) : (
            <Text style={styles.muted}>
              Pick a vehicle first to see availability.
            </Text>
          )}
        </Section>

        {/* ---- Per-day schedule ---- */}
        {form.selectedDates.length > 0 ? (
          <Section
            title="Daily schedule"
            right={
              form.selectedDates.length > 1 ? (
                <Button
                  compact
                  onPress={copyFirstDayToAll}
                  textColor={colors.primary}
                >
                  Copy day 1 to all
                </Button>
              ) : null
            }
          >
            {form.selectedDates.map((date, i) => {
              const detail = form.dayDetails[date] ?? newDayDetail();
              const slots = bookedSlotsByDate[date] ?? [];
              return (
                <View
                  key={date}
                  style={[styles.dayCard, i === 0 && styles.dayCardFirst]}
                >
                  <View style={styles.dayCardHeader}>
                    <Text style={styles.dayCardTitle}>{prettyDate(date)}</Text>
                    <Button
                      compact
                      onPress={() => removeDate(date)}
                      textColor={colors.muted}
                    >
                      Remove
                    </Button>
                  </View>
                  {slots.length > 0 ? (
                    <View style={styles.bookedSlotsHint}>
                      <Text style={styles.bookedSlotsHintText}>
                        Already booked:{" "}
                        {slots
                          .map((s) =>
                            s.start_time
                              ? `${s.start_time.slice(0, 5)}–${s.end_time ? s.end_time.slice(0, 5) : "end"}`
                              : "all day"
                          )
                          .join("  ·  ")}
                      </Text>
                      <Text style={styles.bookedSlotsHintSub}>
                        Pick a start/end time outside these windows.
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.row}>
                    <TextInput
                      label="Start (HH:MM)"
                      value={detail.startTime}
                      onChangeText={(v) =>
                        updateDayDetail(date, { startTime: v })
                      }
                      mode="outlined"
                      style={[styles.input, styles.half]}
                      placeholder="09:00"
                      autoCapitalize="none"
                    />
                    <TextInput
                      label="End (HH:MM)"
                      value={detail.endTime}
                      onChangeText={(v) => updateDayDetail(date, { endTime: v })}
                      mode="outlined"
                      style={[styles.input, styles.half]}
                      placeholder="17:00"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={styles.row}>
                    <TextInput
                      label="Client rate (R)"
                      value={detail.clientRate}
                      onChangeText={(v) =>
                        updateDayDetail(date, { clientRate: v })
                      }
                      mode="outlined"
                      keyboardType="decimal-pad"
                      style={[styles.input, styles.half]}
                    />
                    <TextInput
                      label="Driver rate (R)"
                      value={detail.driverRate}
                      onChangeText={(v) =>
                        updateDayDetail(date, { driverRate: v })
                      }
                      mode="outlined"
                      keyboardType="decimal-pad"
                      style={[styles.input, styles.half]}
                    />
                  </View>
                  <TextInput
                    label="Description for this day"
                    value={detail.notes}
                    onChangeText={(v) => updateDayDetail(date, { notes: v })}
                    mode="outlined"
                    multiline
                    numberOfLines={2}
                    style={styles.input}
                    placeholder="e.g. Airport pickup, then city tour"
                  />
                </View>
              );
            })}
            {(() => {
              const clientTotal = form.selectedDates.reduce(
                (sum, d) =>
                  sum + (parseFloat(form.dayDetails[d]?.clientRate || "") || 0),
                0
              );
              const driverTotal = form.selectedDates.reduce(
                (sum, d) =>
                  sum + (parseFloat(form.dayDetails[d]?.driverRate || "") || 0),
                0
              );
              if (clientTotal === 0 && driverTotal === 0) return null;
              return (
                <View style={styles.totals}>
                  <Total
                    label={`Total client (${form.selectedDates.length} ${form.selectedDates.length === 1 ? "day" : "days"})`}
                    value={`R ${clientTotal.toFixed(2)}`}
                  />
                  <Divider style={styles.totalsDivider} />
                  <Total
                    label="Total driver"
                    value={`R ${driverTotal.toFixed(2)}`}
                  />
                  <Total
                    label="Profit"
                    value={`R ${(clientTotal - driverTotal).toFixed(2)}`}
                    accent
                  />
                </View>
              );
            })()}
          </Section>
        ) : null}

        {/* ---- Customer ---- */}
        <Section title="Customer">
          <TextInput
            label="Full name"
            value={form.customerName}
            onChangeText={(v) => setForm((f) => ({ ...f, customerName: v }))}
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="WhatsApp / Phone"
            value={form.customerPhone}
            onChangeText={(v) => setForm((f) => ({ ...f, customerPhone: v }))}
            mode="outlined"
            keyboardType="phone-pad"
            placeholder="+27..."
            style={styles.input}
          />
          <TextInput
            label="Email"
            value={form.customerEmail}
            onChangeText={(v) => setForm((f) => ({ ...f, customerEmail: v }))}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </Section>

        {/* ---- Trip details ---- */}
        <Section title="Trip details">
          <TextInput
            label="Booking title"
            value={form.title}
            onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
            mode="outlined"
            style={styles.input}
            placeholder="Airport transfer for Smith family"
          />
          <TextInput
            label="Pickup location"
            value={form.pickupLocation}
            onChangeText={(v) => setForm((f) => ({ ...f, pickupLocation: v }))}
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Dropoff location"
            value={form.dropoffLocation}
            onChangeText={(v) =>
              setForm((f) => ({ ...f, dropoffLocation: v }))
            }
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Description / notes"
            value={form.tripDescription}
            onChangeText={(v) =>
              setForm((f) => ({ ...f, tripDescription: v }))
            }
            mode="outlined"
            style={styles.input}
            multiline
            numberOfLines={3}
          />
        </Section>

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={
            createBookingMutation.isPending || updateBookingMutation.isPending
          }
          disabled={
            createBookingMutation.isPending || updateBookingMutation.isPending
          }
          style={styles.submit}
          contentStyle={styles.submitContent}
          labelStyle={styles.submitLabel}
        >
          {isEdit ? "Save changes" : "Create booking"}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card style={styles.section} mode="elevated">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function Total({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={[styles.totalValue, accent && styles.totalValueAccent]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.background,
  },
  scrollContent: { padding: 16, paddingBottom: 32 },
  section: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionTitle: {
    color: colors.heading,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sectionBody: { padding: 16, paddingTop: 12 },
  vehicleButton: { borderRadius: 12, borderColor: colors.border },
  vehicleButtonContent: { height: 48 },
  driverPickerButton: {
    borderRadius: 10,
    borderColor: colors.border,
    marginTop: 6,
  },
  driverPickerButtonContent: { height: 44, justifyContent: "flex-start" },
  vehicleMeta: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  metaValue: { color: colors.heading, fontSize: 15, fontWeight: "600" },
  calendarShell: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  helper: { color: colors.muted, paddingHorizontal: 0 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, gap: 6 },
  chip: { backgroundColor: colors.surfaceMuted },
  chipText: { color: colors.heading, fontSize: 12, fontWeight: "600" },
  muted: { color: colors.muted },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  input: { marginBottom: 10, backgroundColor: colors.surface },

  // Per-day schedule cards
  dayCard: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayCardFirst: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  bookedSlotsHint: {
    backgroundColor: colors.partialBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  bookedSlotsHintText: {
    color: colors.partialText,
    fontSize: 13,
    fontWeight: "700",
  },
  bookedSlotsHintSub: {
    color: colors.partialText,
    fontSize: 11,
    marginTop: 2,
  },
  dayCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  dayCardTitle: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  totals: {
    marginTop: 8,
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: { color: colors.muted, fontWeight: "600" },
  totalValue: { color: colors.text, fontWeight: "700" },
  totalValueAccent: { color: colors.primary },
  totalsDivider: { backgroundColor: colors.border, marginVertical: 4 },
  submit: { borderRadius: 14, marginTop: 8 },
  submitContent: { height: 52 },
  submitLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
});
