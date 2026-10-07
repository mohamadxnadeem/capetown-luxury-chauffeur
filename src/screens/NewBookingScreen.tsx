import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
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
import { useCreateBookingGroup } from "@/hooks/useBookingGroups";
import { useVillas } from "@/hooks/useVillas";
import { useHotels } from "@/hooks/useHotels";
import type { BookedSlot } from "@/api/bookings";
import type {
  Booking,
  CreateBookingDayPayload,
  CreateBookingGroupChildPayload,
  CreateBookingGroupPayload,
  CreateBookingPayload,
  DayType,
  DriverNested,
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
  // When true, this is an accommodation-only booking — vehicleId stays
  // null, driver picker is hidden, per-day rates are skipped, and
  // pricing comes from customTotalClientAmount instead.
  noVehicle: boolean;
  // Operator-set total for accommodation-only bookings. Ignored when a
  // vehicle is selected (rates on each day drive the total).
  customTotalClientAmount: string;
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
  // Proposal bundle add-ons. All optional — a vehicle-only booking leaves
  // them at their defaults (empty arrays). When set, they appear on the
  // client confirmation page as separate sections.
  //
  // Accommodation is now segmented: each entry is a stay at a villa OR
  // hotel over a specific date range. `villa_id` on the write payload is
  // derived from the FIRST villa segment as a legacy-compat fallback.
  accommodationSegments: SegmentDraft[];
  // Multi-vehicle proposal support: when this array is non-empty, the
  // primary vehicle above becomes "vehicle 1" and these become vehicles
  // 2..N. On submit, the app POSTs a BookingGroup with ONE combined
  // Yoco link instead of N standalone bookings.
  additionalVehicles: AdditionalVehicleDraft[];
  // Only shown / used when additionalVehicles.length > 0. This is the
  // client-facing proposal title on the group. Falls back to a generated
  // "N-vehicle proposal for <customer>" if left blank.
  proposalTitle: string;
}

interface SegmentDraft {
  start_date: string; // YYYY-MM-DD, must be inside form.selectedDates
  end_date: string; // YYYY-MM-DD
  kind: "villa" | "hotel";
  villa_id: number | null;
  hotel_id: number | null;
  notes: string;
}

// An additional vehicle entry on a multi-vehicle proposal. Shares the
// primary vehicle's dates by default so most proposals need to fill in
// just a vehicle + rate. The operator can also override pickup/dropoff
// and add per-vehicle notes.
interface AdditionalVehicleDraft {
  vehicleId: number | null;
  driverId: number | null;
  // R/day flat rate — applied to every date the primary booking covers.
  clientRatePerDay: string;
  driverRatePerDay: string;
  pickupLocation: string;
  dropoffLocation: string;
  tripDescription: string;
}

function newAdditionalVehicle(): AdditionalVehicleDraft {
  return {
    vehicleId: null,
    driverId: null,
    clientRatePerDay: "",
    driverRatePerDay: "",
    pickupLocation: "",
    dropoffLocation: "",
    tripDescription: "",
  };
}

function newSegment(defaultStart?: string, defaultEnd?: string): SegmentDraft {
  return {
    start_date: defaultStart ?? "",
    end_date: defaultEnd ?? defaultStart ?? "",
    kind: "villa",
    villa_id: null,
    hotel_id: null,
    notes: "",
  };
}

const EMPTY_FORM: FormState = {
  noVehicle: false,
  customTotalClientAmount: "",
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
  accommodationSegments: [],
  additionalVehicles: [],
  proposalTitle: "",
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

// A shift is overnight when the end time is EARLIER than the start time —
// e.g. 21:00 → 02:00 (9pm to 2am next morning). String comparison on
// "HH:MM" is correct here because both are the same length and zero-padded.
// Returns false if either side can't be parsed, so the backend's own
// validation can speak up.
function isOvernightShift(
  startTime: string,
  endTime: string
): boolean {
  const start = timeForApi(startTime);
  const end = timeForApi(endTime);
  if (!start || !end) return false;
  return end < start;
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
    // Existing bookings with no car are treated as accommodation-only.
    noVehicle: b.car == null,
    // Backend derives total from days when car is set; when it isn't,
    // read whatever total the backend returned so the operator can edit.
    customTotalClientAmount: b.car == null ? (b.total_client_amount ?? "") : "",
    vehicleId: b.car?.id ?? null,
    driverId: b.driver?.id ?? null,
    selectedDates: days.map((d) => d.date).sort(),
    dayDetails,
    dayType: first?.day_type ?? "full_day",
    customerName: b.customer_name ?? "",
    customerPhone: b.customer_phone ?? "",
    customerEmail: b.customer_email ?? "",
    // Prefer new-shape segments when the backend returns them; fall back
    // to the legacy single villa so pre-migration bookings still open
    // with something in the accommodation section.
    accommodationSegments: (b.accommodation_segments ?? []).length > 0
      ? (b.accommodation_segments ?? []).map((s) => ({
          start_date: s.start_date,
          end_date: s.end_date,
          kind: s.kind,
          villa_id: s.villa?.id ?? null,
          hotel_id: s.hotel?.id ?? null,
          notes: s.notes ?? "",
        }))
      : b.villa
        ? [
            {
              start_date: days[0]?.date ?? "",
              end_date: days[days.length - 1]?.date ?? "",
              kind: "villa" as const,
              villa_id: b.villa.id,
              hotel_id: null,
              notes: "",
            },
          ]
        : [],
    title: b.title ?? "",
    pickupLocation: b.pickup_location ?? "",
    dropoffLocation: b.dropoff_location ?? "",
    tripDescription: b.trip_description ?? "",
    // Editing an existing booking never lets the operator add MORE
    // vehicles inline — that's what the group detail screen's
    // "+ Add booking" does. Keep this empty; the edit form only knows
    // about the single booking being edited.
    additionalVehicles: [],
    proposalTitle: "",
  };
}

export default function NewBookingScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  // The "NewBooking" stack route may pass { vehicleId, dates }; the
  // "BookingEdit" stack route passes { bookingId }. Read params loosely
  // since the screen serves both.
  const params = route.params as
    | {
        vehicleId?: number;
        bookingId?: number;
        dates?: string[];
        preselectAccommodation?: { kind: "villa" | "hotel"; id: number };
      }
    | undefined;
  const editingId = params?.bookingId;
  const isEdit = editingId != null;

  const optionsQuery = useBookingFormOptions();
  // Bundle pickers — fetch live so the operator always sees what's currently
  // active on the marketing site. All three feeds are independent and cheap.
  const villasQuery = useVillas({ is_active: true });
  const hotelsQuery = useHotels({ is_active: true });
  const bookingQuery = useAdminBooking(editingId);
  const createBookingMutation = useCreateBooking();
  const createBookingGroupMutation = useCreateBookingGroup();
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

  // Create mode: pre-select an accommodation when opened from a Villa or
  // Hotel detail via navigation.navigate('NewBooking', {
  // preselectAccommodation: { kind, id } }). Sets no-chauffeur mode by
  // default so the operator can just add dates + price and save.
  const accommodationPreselectedRef = useRef(false);
  useEffect(() => {
    if (isEdit || accommodationPreselectedRef.current) return;
    const pre = params?.preselectAccommodation;
    if (!pre) return;
    setForm((f) => ({
      ...f,
      noVehicle: true,
      vehicleId: null,
      driverId: null,
      dayDetails: {},
      accommodationSegments: [
        {
          start_date: "",
          end_date: "",
          kind: pre.kind,
          villa_id: pre.kind === "villa" ? pre.id : null,
          hotel_id: pre.kind === "hotel" ? pre.id : null,
          notes: "",
        },
      ],
    }));
    accommodationPreselectedRef.current = true;
  }, [isEdit, params?.preselectAccommodation]);

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
        // Picking a real vehicle flips out of accommodation-only mode.
        noVehicle: false,
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

  // ---- Additional-vehicle helpers (multi-vehicle proposal mode) --------
  function addAnotherVehicle() {
    setForm((f) => ({
      ...f,
      additionalVehicles: [...f.additionalVehicles, newAdditionalVehicle()],
    }));
  }

  function updateAdditionalVehicle(
    index: number,
    patch: Partial<AdditionalVehicleDraft>
  ) {
    setForm((f) => {
      const next = [...f.additionalVehicles];
      next[index] = { ...next[index], ...patch };
      return { ...f, additionalVehicles: next };
    });
  }

  function removeAdditionalVehicle(index: number) {
    setForm((f) => ({
      ...f,
      additionalVehicles: f.additionalVehicles.filter((_, i) => i !== index),
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
    if (!form.noVehicle && form.vehicleId == null) return "Pick a vehicle.";
    if (form.selectedDates.length === 0) return "Select at least one date.";
    if (!form.customerName.trim()) return "Customer name is required.";

    if (form.noVehicle) {
      // Accommodation-only: at least one stay + a total price.
      if (form.accommodationSegments.length === 0) {
        return "Add at least one accommodation stay.";
      }
      for (const seg of form.accommodationSegments) {
        if (seg.kind === "villa" && seg.villa_id == null) {
          return "Pick a villa for every stay, or switch it to Hotel.";
        }
        if (seg.kind === "hotel" && seg.hotel_id == null) {
          return "Pick a hotel for every stay, or switch it to Villa.";
        }
      }
      const total = parseFloat(form.customTotalClientAmount);
      if (
        !form.customTotalClientAmount.trim() ||
        isNaN(total) ||
        total <= 0
      ) {
        return "Enter the total client price.";
      }
      return null;
    }

    // Vehicle booking: per-day rates + times required.
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

    // Multi-vehicle: each additional entry must have a vehicle + valid
    // per-day rates. Editing existing bookings can't be multi-vehicle
    // (guarded at UI-render level, but re-check here too).
    if (form.additionalVehicles.length > 0) {
      if (isEdit) {
        return "Add more vehicles from the group screen, not the edit form.";
      }
      for (let i = 0; i < form.additionalVehicles.length; i++) {
        const av = form.additionalVehicles[i];
        const label = `vehicle ${i + 2}`;
        if (av.vehicleId == null) {
          return `Pick a vehicle for ${label}.`;
        }
        if (av.vehicleId === form.vehicleId) {
          return `${label} is the same as vehicle 1 — pick a different vehicle.`;
        }
        for (let j = 0; j < i; j++) {
          if (form.additionalVehicles[j].vehicleId === av.vehicleId) {
            return `${label} duplicates vehicle ${j + 2} — pick a different one.`;
          }
        }
        const clientRate = parseFloat(av.clientRatePerDay);
        const driverRate = parseFloat(av.driverRatePerDay);
        if (isNaN(clientRate) || clientRate <= 0) {
          return `Enter a client rate for ${label}.`;
        }
        if (isNaN(driverRate) || driverRate < 0) {
          return `Enter a driver rate for ${label}.`;
        }
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
    // Days array carries per-day vehicle rates. For accommodation-only
    // bookings there are no rates and no chauffeur schedule — send an
    // empty array so the booking still has the date range attached
    // (backend can derive start/end from it).
    const days: CreateBookingDayPayload[] = form.noVehicle
      ? []
      : form.selectedDates.map((date) => {
          const detail = form.dayDetails[date] ?? newDayDetail();
          const overnight = isOvernightShift(detail.startTime, detail.endTime);
          return {
            date,
            day_type: form.dayType,
            start_time: timeForApi(detail.startTime),
            end_time: timeForApi(detail.endTime),
            // Auto-detected from the time values the operator typed — if
            // end is earlier than start, we assume it crosses midnight.
            // Backend requires this flag true for end<start to be valid.
            end_next_day: overnight,
            notes: detail.notes.trim() || null,
            client_rate: parseFloat(detail.clientRate).toFixed(2),
            driver_rate: parseFloat(detail.driverRate).toFixed(2),
            driver_payment_status: "unpaid",
          };
        });

    const payload: CreateBookingPayload = {
      car: form.noVehicle ? null : form.vehicleId!,
      title: form.title.trim() || form.customerName.trim(),
      customer_name: form.customerName.trim(),
      customer_email: form.customerEmail.trim(),
      customer_phone: form.customerPhone.trim(),
      pickup_location: form.pickupLocation.trim(),
      dropoff_location: form.dropoffLocation.trim(),
      trip_description: form.tripDescription.trim(),
      status: "pending",
      days,
      // Always send driver explicitly — null means "no driver assigned",
      // which the backend accepts (driver is a nullable FK).
      driver: form.driverId,
      // Proposal bundle add-ons. Send empty arrays / null explicitly so
      // editing a booking can clear previously-set ones.
      // `villa_id` is a legacy-compat fallback derived from the first
      // villa segment — remove once the backend fully uses segments.
      villa_id:
        form.accommodationSegments.find(
          (s) => s.kind === "villa" && s.villa_id != null
        )?.villa_id ?? null,
      accommodation_segments: form.accommodationSegments.map((s) => ({
        start_date: s.start_date,
        end_date: s.end_date,
        kind: s.kind,
        villa_id: s.kind === "villa" ? s.villa_id : null,
        hotel_id: s.kind === "hotel" ? s.hotel_id : null,
        notes: s.notes.trim(),
      })),
      // Only sent for accommodation-only bookings; the backend ignores
      // this when a vehicle is set (rates on days drive the total there).
      ...(form.noVehicle
        ? {
            custom_total_client_amount: parseFloat(
              form.customTotalClientAmount
            ).toFixed(2),
          }
        : {}),
    };

    // Multi-vehicle branch: POST /api/admin/booking-groups/create/ with the
    // primary booking as bookings[0] and each additional vehicle expanded
    // into per-day rate rows using the primary vehicle's dates. The
    // additional-vehicle UI is intentionally simple (one flat rate per
    // vehicle, same date range as primary) — 95% of multi-vehicle
    // proposals are two cars doing the same tour together.
    if (!isEdit && form.additionalVehicles.length > 0) {
      // We already validated above that noVehicle=false and dates exist.
      const primaryChild: CreateBookingGroupChildPayload = {
        car: form.vehicleId!,
        driver: form.driverId,
        title: form.title.trim() || undefined,
        pickup_location: form.pickupLocation.trim(),
        dropoff_location: form.dropoffLocation.trim(),
        trip_description: form.tripDescription.trim(),
        days,
        villa_id: payload.villa_id,
        accommodation_segments: payload.accommodation_segments,
      };

      const additionalChildren: CreateBookingGroupChildPayload[] =
        form.additionalVehicles.map((av) => ({
          car: av.vehicleId!,
          driver: av.driverId,
          pickup_location:
            av.pickupLocation.trim() || form.pickupLocation.trim(),
          dropoff_location:
            av.dropoffLocation.trim() || form.dropoffLocation.trim(),
          trip_description:
            av.tripDescription.trim() || form.tripDescription.trim(),
          // Expand the primary's dates into per-day rows for this vehicle.
          // Times mirror the primary's (matches the "two cars same tour"
          // pattern); operator can tweak from the child booking's detail
          // screen after the group is created.
          days: form.selectedDates.map((date) => {
            const primaryDetail = form.dayDetails[date] ?? newDayDetail();
            return {
              date,
              day_type: form.dayType,
              start_time: timeForApi(primaryDetail.startTime),
              end_time: timeForApi(primaryDetail.endTime),
              end_next_day: isOvernightShift(
                primaryDetail.startTime,
                primaryDetail.endTime
              ),
              notes: null,
              client_rate: parseFloat(av.clientRatePerDay).toFixed(2),
              driver_rate: parseFloat(av.driverRatePerDay).toFixed(2),
              driver_payment_status: "unpaid",
            };
          }),
        }));

      const groupPayload: CreateBookingGroupPayload = {
        title:
          form.proposalTitle.trim() ||
          `${1 + form.additionalVehicles.length}-vehicle proposal for ${form.customerName.trim()}`,
        customer_name: form.customerName.trim(),
        customer_email: form.customerEmail.trim(),
        customer_phone: form.customerPhone.trim(),
        status: "pending",
        bookings: [primaryChild, ...additionalChildren],
      };

      try {
        const group =
          await createBookingGroupMutation.mutateAsync(groupPayload);
        Alert.alert(
          "Proposal created",
          `${group.group_reference} — ${group.bookings.length} vehicles bundled.`,
          [
            {
              text: "View",
              onPress: () =>
                navigation.replace("BookingGroupDetail", {
                  groupId: group.id,
                }),
            },
            {
              text: "New booking",
              style: "cancel",
              onPress: () => setForm(EMPTY_FORM),
            },
          ]
        );
      } catch (err: unknown) {
        Alert.alert("Couldn't create proposal", formatApiError(err));
      }
      return;
    }

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
                {form.noVehicle
                  ? "No chauffeur — accommodation only"
                  : selectedVehicle
                    ? selectedVehicle.title
                    : "Choose a vehicle"}
              </Button>
            }
          >
            <Menu.Item
              onPress={() => {
                setVehicleMenuOpen(false);
                setForm((f) => ({
                  ...f,
                  noVehicle: true,
                  vehicleId: null,
                  driverId: null,
                  // Clear per-day rates — they don't apply without a vehicle.
                  dayDetails: {},
                }));
              }}
              title="No chauffeur — accommodation only"
              leadingIcon={form.noVehicle ? "check" : undefined}
            />
            {vehicles
              .filter((v) => v.is_active)
              .map((v) => (
                <Menu.Item
                  key={v.id}
                  onPress={() => pickVehicle(v)}
                  title={`${v.title}${v.registration_number ? `  ·  ${v.registration_number}` : ""}`}
                  leadingIcon={
                    !form.noVehicle && form.vehicleId === v.id
                      ? "check"
                      : undefined
                  }
                />
              ))}
          </Menu>
          {selectedVehicle && !form.noVehicle ? (
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
          {selectedVehicle || form.noVehicle ? (
            <>
              <View style={styles.calendarShell}>
                <Calendar
                  // No vehicle → no availability marks, but the operator
                  // still needs to pick the accommodation date range.
                  markedDates={form.noVehicle ? {} : markedDates}
                  markingType="custom"
                  onDayPress={toggleDate}
                  theme={calendarTheme}
                  enableSwipeMonths
                  // Intentionally no minDate — operator can back-date
                  // bookings to record trips that weren't captured in
                  // the app at the time. Availability marks still block
                  // clashes on past dates the same way they do on
                  // future ones.
                />
              </View>
              {!form.noVehicle && unavailableQuery.isLoading ? (
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
                  {form.noVehicle
                    ? "Tap the nights the client is staying."
                    : "Tap dates to add them. Greyed dates are already booked."}
                </HelperText>
              )}
            </>
          ) : (
            <Text style={styles.muted}>
              Pick a vehicle first, or choose "No chauffeur — accommodation
              only" above.
            </Text>
          )}
        </Section>

        {/* ---- Per-day schedule (vehicle bookings only) ---- */}
        {form.selectedDates.length > 0 && !form.noVehicle ? (
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
                  {/* Auto-detected overnight indicator: when the operator
                      types an end time earlier than the start, we treat
                      the shift as crossing midnight. Shown so the operator
                      can confirm the system understood the intent. */}
                  {isOvernightShift(detail.startTime, detail.endTime) ? (
                    <Text style={styles.overnightHint}>
                      🌙 Overnight shift — ends the next morning
                    </Text>
                  ) : null}
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

        {/* ---- Additional vehicles (multi-vehicle proposal) ---- */}
        {!isEdit && !form.noVehicle ? (
          <Section
            title={
              form.additionalVehicles.length === 0
                ? "Additional vehicles (optional)"
                : `Additional vehicles (${form.additionalVehicles.length})`
            }
            right={
              form.additionalVehicles.length > 0 ? (
                <Button
                  compact
                  onPress={addAnotherVehicle}
                  icon="plus"
                  textColor={colors.primary}
                >
                  Add
                </Button>
              ) : null
            }
          >
            <Text style={styles.helper}>
              Bundle this booking with more vehicles into ONE client-facing
              proposal — one URL, one combined total, one Yoco payment link.
              All added vehicles use the primary vehicle's dates.
            </Text>

            {form.additionalVehicles.length === 0 ? (
              <Button
                mode="outlined"
                onPress={addAnotherVehicle}
                icon="plus"
                style={[styles.bundlePickerButton, { marginTop: 12 }]}
                contentStyle={styles.bundlePickerButtonContent}
                textColor={colors.primary}
                disabled={form.selectedDates.length === 0}
              >
                {form.selectedDates.length === 0
                  ? "Pick primary dates first"
                  : "+ Add another vehicle"}
              </Button>
            ) : (
              <>
                <TextInput
                  label="Proposal title (optional)"
                  value={form.proposalTitle}
                  onChangeText={(v) =>
                    setForm((f) => ({ ...f, proposalTitle: v }))
                  }
                  mode="outlined"
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="e.g. Cape Town family tour — 5 nights, 2 vehicles"
                />
                {form.additionalVehicles.map((av, i) => (
                  <AdditionalVehicleCard
                    key={i}
                    index={i}
                    entry={av}
                    vehicles={vehicles}
                    drivers={drivers}
                    excludedVehicleIds={[
                      form.vehicleId,
                      ...form.additionalVehicles
                        .map((x, j) => (j !== i ? x.vehicleId : null)),
                    ].filter((id): id is number => id != null)}
                    dayCount={form.selectedDates.length}
                    onChange={(patch) => updateAdditionalVehicle(i, patch)}
                    onRemove={() => removeAdditionalVehicle(i)}
                  />
                ))}
              </>
            )}
          </Section>
        ) : null}

        {/* ---- Accommodation (optional) ---- */}
        <Section title="Accommodation (optional)">
          <Text style={styles.helper}>
            Attach one or more villa / hotel stays over the booking's
            date range. The client sees them on the confirmation page
            alongside the vehicle booking.
          </Text>

          <View style={styles.segmentsHeader}>
            <Text style={styles.miniLabel}>Stays</Text>
            <Button
              compact
              onPress={() =>
                setForm((f) => {
                  // Default new segment to the first free/last-used date range
                  // in the booking so the operator isn't typing dates.
                  const firstDate = f.selectedDates[0] ?? "";
                  const lastDate =
                    f.selectedDates[f.selectedDates.length - 1] ?? firstDate;
                  return {
                    ...f,
                    accommodationSegments: [
                      ...f.accommodationSegments,
                      newSegment(firstDate, lastDate),
                    ],
                  };
                })
              }
              icon="plus"
              textColor={colors.primary}
            >
              Add stay
            </Button>
          </View>

          {form.accommodationSegments.length === 0 ? (
            <Text style={styles.helper}>
              No accommodation attached. Tap "Add stay" to add a villa or
              hotel — you can add multiple to cover different dates.
            </Text>
          ) : (
            form.accommodationSegments.map((seg, i) => (
              <SegmentCard
                key={i}
                index={i}
                segment={seg}
                availableDates={form.selectedDates}
                villas={villasQuery.data ?? []}
                hotels={hotelsQuery.data ?? []}
                onChange={(patch) =>
                  setForm((f) => {
                    const next = [...f.accommodationSegments];
                    next[i] = { ...next[i], ...patch };
                    return { ...f, accommodationSegments: next };
                  })
                }
                onRemove={() =>
                  setForm((f) => ({
                    ...f,
                    accommodationSegments: f.accommodationSegments.filter(
                      (_, j) => j !== i
                    ),
                  }))
                }
              />
            ))
          )}

        </Section>

        {/* ---- Price (accommodation-only bookings) ---- */}
        {form.noVehicle ? (
          <Section title="Price">
            <Text style={styles.helper}>
              Enter the total the client should be charged for this stay.
              No per-day rates are needed without a chauffeur.
            </Text>
            <TextInput
              label="Total client amount (R)"
              value={form.customTotalClientAmount}
              onChangeText={(v) =>
                setForm((f) => ({ ...f, customTotalClientAmount: v }))
              }
              mode="outlined"
              keyboardType="decimal-pad"
              style={[styles.input, { marginTop: 10 }]}
            />
          </Section>
        ) : null}

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={
            createBookingMutation.isPending ||
            createBookingGroupMutation.isPending ||
            updateBookingMutation.isPending
          }
          disabled={
            createBookingMutation.isPending ||
            createBookingGroupMutation.isPending ||
            updateBookingMutation.isPending
          }
          style={styles.submit}
          contentStyle={styles.submitContent}
          labelStyle={styles.submitLabel}
        >
          {isEdit
            ? "Save changes"
            : form.additionalVehicles.length > 0
              ? `Create ${1 + form.additionalVehicles.length}-vehicle proposal`
              : "Create booking"}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Compact card for a secondary vehicle on a multi-vehicle proposal.
// Deliberately lightweight vs. the primary vehicle section — it inherits
// the primary's dates, uses a single R/day rate (rather than per-day
// editing), and defaults pickup/dropoff/description to the primary's if
// left blank. This matches the common case (2 cars, same tour) without
// overwhelming the operator on the first form.
function AdditionalVehicleCard({
  index,
  entry,
  vehicles,
  drivers,
  excludedVehicleIds,
  dayCount,
  onChange,
  onRemove,
}: {
  index: number;
  entry: AdditionalVehicleDraft;
  vehicles: Vehicle[];
  drivers: DriverNested[];
  excludedVehicleIds: number[];
  dayCount: number;
  onChange: (patch: Partial<AdditionalVehicleDraft>) => void;
  onRemove: () => void;
}) {
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [driverMenuOpen, setDriverMenuOpen] = useState(false);

  const selectedVehicle = vehicles.find((v) => v.id === entry.vehicleId);
  const selectedDriver = drivers.find((d) => d.id === entry.driverId);
  const excluded = new Set(excludedVehicleIds);
  const clientRate = parseFloat(entry.clientRatePerDay || "0");
  const totalClient = isNaN(clientRate) ? 0 : clientRate * dayCount;

  return (
    <View style={styles.segmentCard}>
      <View style={styles.segmentHeader}>
        <Text style={styles.segmentTitle}>Vehicle {index + 2}</Text>
        <Button compact onPress={onRemove} textColor={colors.muted}>
          Remove
        </Button>
      </View>

      {/* Vehicle picker — excludes vehicles already used on the proposal. */}
      <Menu
        visible={vehicleMenuOpen}
        onDismiss={() => setVehicleMenuOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setVehicleMenuOpen(true)}
            style={styles.bundlePickerButton}
            contentStyle={styles.bundlePickerButtonContent}
            textColor={selectedVehicle ? colors.heading : colors.muted}
          >
            {selectedVehicle ? selectedVehicle.title : "Choose a vehicle"}
          </Button>
        }
      >
        {vehicles
          .filter((v) => v.is_active && !excluded.has(v.id))
          .map((v) => (
            <Menu.Item
              key={v.id}
              onPress={() => {
                onChange({
                  vehicleId: v.id,
                  driverId: v.driver?.id ?? entry.driverId,
                  clientRatePerDay: entry.clientRatePerDay || v.price || "",
                  driverRatePerDay:
                    entry.driverRatePerDay ||
                    v.driver?.default_daily_rate ||
                    "",
                });
                setVehicleMenuOpen(false);
              }}
              title={v.title}
              leadingIcon={entry.vehicleId === v.id ? "check" : undefined}
            />
          ))}
      </Menu>

      {/* Driver picker */}
      <Menu
        visible={driverMenuOpen}
        onDismiss={() => setDriverMenuOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setDriverMenuOpen(true)}
            style={[styles.bundlePickerButton, { marginTop: 8 }]}
            contentStyle={styles.bundlePickerButtonContent}
            textColor={selectedDriver ? colors.heading : colors.muted}
          >
            {selectedDriver ? selectedDriver.full_name : "No driver assigned"}
          </Button>
        }
      >
        <Menu.Item
          onPress={() => {
            onChange({ driverId: null });
            setDriverMenuOpen(false);
          }}
          title="No driver assigned"
          leadingIcon={entry.driverId == null ? "check" : undefined}
        />
        {drivers.map((d) => (
          <Menu.Item
            key={d.id}
            onPress={() => {
              onChange({ driverId: d.id });
              setDriverMenuOpen(false);
            }}
            title={d.full_name}
            leadingIcon={entry.driverId === d.id ? "check" : undefined}
          />
        ))}
      </Menu>

      <View style={[styles.row, { marginTop: 10 }]}>
        <TextInput
          label="Client rate (R / day)"
          value={entry.clientRatePerDay}
          onChangeText={(v) => onChange({ clientRatePerDay: v })}
          mode="outlined"
          keyboardType="decimal-pad"
          style={[styles.input, styles.half]}
        />
        <TextInput
          label="Driver rate (R / day)"
          value={entry.driverRatePerDay}
          onChangeText={(v) => onChange({ driverRatePerDay: v })}
          mode="outlined"
          keyboardType="decimal-pad"
          style={[styles.input, styles.half]}
        />
      </View>

      {totalClient > 0 && dayCount > 0 ? (
        <Text style={styles.helper}>
          × {dayCount} {dayCount === 1 ? "day" : "days"} = R{" "}
          {totalClient.toFixed(2)}
        </Text>
      ) : null}

      <TextInput
        label="Pickup location (optional)"
        value={entry.pickupLocation}
        onChangeText={(v) => onChange({ pickupLocation: v })}
        mode="outlined"
        style={[styles.input, { marginTop: 8 }]}
        placeholder="Falls back to primary vehicle's pickup"
      />
      <TextInput
        label="Dropoff location (optional)"
        value={entry.dropoffLocation}
        onChangeText={(v) => onChange({ dropoffLocation: v })}
        mode="outlined"
        style={styles.input}
        placeholder="Falls back to primary vehicle's dropoff"
      />
      <TextInput
        label="Description for this vehicle (optional)"
        value={entry.tripDescription}
        onChangeText={(v) => onChange({ tripDescription: v })}
        mode="outlined"
        multiline
        numberOfLines={2}
        style={styles.input}
        placeholder="e.g. Second car for luggage / larger group"
      />
    </View>
  );
}

// Single-select picker rendered as a dropdown menu. Used for the villa
// slot — null means "no villa".
// Per-segment card: kind toggle (villa/hotel), start/end date pickers
// (constrained to the dates the operator already picked on the booking
// calendar), villa or hotel picker, and a notes field. All operator-set —
// the client sees the resolved data on the confirmation page.
function SegmentCard({
  index,
  segment,
  availableDates,
  villas,
  hotels,
  onChange,
  onRemove,
}: {
  index: number;
  segment: SegmentDraft;
  availableDates: string[];
  villas: { id: number; name: string }[];
  hotels: { id: number; name: string }[];
  onChange: (patch: Partial<SegmentDraft>) => void;
  onRemove: () => void;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);

  // End options are dates >= start_date (falls back to all if no start yet).
  const endOptions = segment.start_date
    ? availableDates.filter((d) => d >= segment.start_date)
    : availableDates;

  const selectedName =
    segment.kind === "villa"
      ? villas.find((v) => v.id === segment.villa_id)?.name
      : hotels.find((h) => h.id === segment.hotel_id)?.name;
  const placeholder =
    segment.kind === "villa"
      ? "Pick a villa"
      : "Pick a hotel";
  const placeOptions = segment.kind === "villa" ? villas : hotels;
  const selectedPlaceId =
    segment.kind === "villa" ? segment.villa_id : segment.hotel_id;

  return (
    <View style={styles.segmentCard}>
      <View style={styles.segmentHeader}>
        <Text style={styles.segmentTitle}>Stay {index + 1}</Text>
        <Button compact onPress={onRemove} textColor={colors.muted}>
          Remove
        </Button>
      </View>

      {/* Kind toggle */}
      <View style={styles.kindToggle}>
        {(["villa", "hotel"] as const).map((k) => {
          const active = segment.kind === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() =>
                onChange({
                  kind: k,
                  // Clear the OTHER side so we don't accidentally send both.
                  villa_id: k === "villa" ? segment.villa_id : null,
                  hotel_id: k === "hotel" ? segment.hotel_id : null,
                })
              }
              activeOpacity={0.85}
              style={[
                styles.kindToggleBtn,
                active && styles.kindToggleBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.kindToggleText,
                  active && styles.kindToggleTextActive,
                ]}
              >
                {k === "villa" ? "Villa" : "Hotel"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date pickers — constrained to booking's selectedDates. */}
      <View style={styles.row}>
        <Menu
          visible={startOpen}
          onDismiss={() => setStartOpen(false)}
          anchor={
            <View style={[styles.half]}>
              <Button
                mode="outlined"
                onPress={() => setStartOpen(true)}
                style={styles.bundlePickerButton}
                contentStyle={styles.bundlePickerButtonContent}
                textColor={
                  segment.start_date ? colors.heading : colors.muted
                }
              >
                {segment.start_date
                  ? `From ${prettyDate(segment.start_date)}`
                  : "From…"}
              </Button>
            </View>
          }
        >
          {availableDates.length === 0 ? (
            <Menu.Item title="Pick booking dates first" disabled />
          ) : (
            availableDates.map((d) => (
              <Menu.Item
                key={d}
                onPress={() => {
                  // If a start > current end, push end forward.
                  const newEnd =
                    segment.end_date && d > segment.end_date ? d : segment.end_date;
                  onChange({ start_date: d, end_date: newEnd });
                  setStartOpen(false);
                }}
                title={prettyDate(d)}
                leadingIcon={segment.start_date === d ? "check" : undefined}
              />
            ))
          )}
        </Menu>

        <Menu
          visible={endOpen}
          onDismiss={() => setEndOpen(false)}
          anchor={
            <View style={[styles.half]}>
              <Button
                mode="outlined"
                onPress={() => setEndOpen(true)}
                style={styles.bundlePickerButton}
                contentStyle={styles.bundlePickerButtonContent}
                textColor={
                  segment.end_date ? colors.heading : colors.muted
                }
              >
                {segment.end_date
                  ? `To ${prettyDate(segment.end_date)}`
                  : "To…"}
              </Button>
            </View>
          }
        >
          {endOptions.length === 0 ? (
            <Menu.Item title="Pick a start date first" disabled />
          ) : (
            endOptions.map((d) => (
              <Menu.Item
                key={d}
                onPress={() => {
                  onChange({ end_date: d });
                  setEndOpen(false);
                }}
                title={prettyDate(d)}
                leadingIcon={segment.end_date === d ? "check" : undefined}
              />
            ))
          )}
        </Menu>
      </View>

      {/* Villa / Hotel picker */}
      <Menu
        visible={placeOpen}
        onDismiss={() => setPlaceOpen(false)}
        anchor={
          <Button
            mode="outlined"
            onPress={() => setPlaceOpen(true)}
            style={[styles.bundlePickerButton, { marginTop: 8 }]}
            contentStyle={styles.bundlePickerButtonContent}
            textColor={selectedPlaceId == null ? colors.muted : colors.heading}
          >
            {selectedName ?? placeholder}
          </Button>
        }
      >
        {placeOptions.length === 0 ? (
          <Menu.Item
            title={`No ${segment.kind}s available`}
            disabled
          />
        ) : (
          placeOptions.map((o) => (
            <Menu.Item
              key={o.id}
              onPress={() => {
                if (segment.kind === "villa") {
                  onChange({ villa_id: o.id });
                } else {
                  onChange({ hotel_id: o.id });
                }
                setPlaceOpen(false);
              }}
              title={o.name}
              leadingIcon={selectedPlaceId === o.id ? "check" : undefined}
            />
          ))
        )}
      </Menu>

      <TextInput
        label="Notes (optional)"
        value={segment.notes}
        onChangeText={(v) => onChange({ notes: v })}
        mode="outlined"
        multiline
        numberOfLines={2}
        style={[styles.input, { marginTop: 10 }]}
        placeholder="e.g. Upgrade to sea-view suite, request early check-in"
      />
    </View>
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
  overnightHint: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: -4,
    marginBottom: 10,
    paddingHorizontal: 2,
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

  // Bundle pickers (villa / experiences / packages).
  miniLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  bundlePickerButton: {
    borderRadius: 12,
    borderColor: colors.border,
  },
  bundlePickerButtonContent: { height: 48, justifyContent: "flex-start" },
  multiPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  multiPickerRowSelected: {
    borderColor: colors.primary,
    backgroundColor: "rgba(11,91,51,0.06)",
  },
  multiPickerLabel: {
    color: colors.heading,
    fontSize: 14,
    fontWeight: "700",
  },
  multiPickerSublabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  multiPickerCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  multiPickerCheckActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  multiPickerCheckMark: { color: "#fff", fontWeight: "800", fontSize: 14 },

  // Accommodation segments builder.
  segmentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 6,
  },
  segmentCard: {
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  segmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  segmentTitle: { color: colors.heading, fontSize: 14, fontWeight: "800" },
  kindToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    padding: 3,
    gap: 3,
    marginBottom: 10,
  },
  kindToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
  },
  kindToggleBtnActive: { backgroundColor: colors.surface },
  kindToggleText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  kindToggleTextActive: { color: colors.heading },
});
