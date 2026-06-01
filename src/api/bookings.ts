import { api } from "./client";
import type {
  Booking,
  BookingFormOptions,
  CreateBookingPayload,
  DriverScheduleEvent,
  VehiclesAvailableResponse,
} from "./types";

// ---- Admin: bookings ----------------------------------------------------

export async function fetchAdminBookings(params?: {
  status?: string;
  driver?: number;
  car?: number;
  start_date?: string;
  end_date?: string;
  customer?: string;
  booking_reference?: string;
  is_multi_day?: boolean;
}): Promise<Booking[]> {
  const resp = await api.get<Booking[] | { results: Booking[] }>(
    "/api/admin/bookings/",
    { params }
  );
  // Handle both paginated and bare-list responses.
  const data = resp.data;
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function fetchAdminBooking(id: number | string): Promise<Booking> {
  const resp = await api.get<Booking>(`/api/admin/bookings/${id}/`);
  return resp.data;
}

export async function createBooking(
  payload: CreateBookingPayload
): Promise<Booking> {
  const resp = await api.post<Booking>("/api/admin/bookings/create/", payload);
  return resp.data;
}

export async function updateBooking(
  id: number | string,
  patch: Partial<CreateBookingPayload> & { status?: string; driver?: number | null }
): Promise<Booking> {
  const resp = await api.patch<Booking>(`/api/admin/bookings/${id}/update/`, patch);
  return resp.data;
}

export async function deleteBooking(id: number | string): Promise<void> {
  await api.delete(`/api/admin/bookings/${id}/delete/`);
}

// ---- Admin: form options + availability ---------------------------------

export async function fetchBookingFormOptions(): Promise<BookingFormOptions> {
  const resp = await api.get<BookingFormOptions>(
    "/api/admin/booking-form-options/"
  );
  return resp.data;
}

export async function fetchVehiclesAvailable(
  start_date: string,
  end_date?: string
): Promise<VehiclesAvailableResponse> {
  const resp = await api.get<VehiclesAvailableResponse>(
    "/api/admin/vehicles-available/",
    { params: { start_date, end_date } }
  );
  return resp.data;
}

// Per-vehicle availability summary. `unavailable` = fully-booked days (grey
// out, not selectable). `partiallyBooked` = days with bookings but free time
// left (selectable, shown with a hint). `booked` = any day with >=1 booking.
export interface VehicleUnavailability {
  unavailable: string[];
  partiallyBooked: string[];
  booked: string[];
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((d): d is string => typeof d === "string") : [];
}

export async function fetchVehicleUnavailableDates(
  vehicleId: number,
  start_date?: string,
  end_date?: string
): Promise<VehicleUnavailability> {
  const resp = await api.get<unknown>(
    `/api/admin/vehicles/${vehicleId}/unavailable-dates/`,
    { params: { start_date, end_date } }
  );
  const data = resp.data;
  // Current backend shape: { unavailable_dates, partially_booked_dates,
  // booked_dates, ... }.
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    return {
      unavailable: asStringArray(o.unavailable_dates),
      partiallyBooked: asStringArray(o.partially_booked_dates),
      booked: asStringArray(o.booked_dates),
    };
  }
  // Back-compat: an older deploy returned a bare array of fully-booked dates.
  if (Array.isArray(data)) {
    const flat = data
      .map((it) =>
        typeof it === "string" ? it : (it as { date?: string })?.date ?? null
      )
      .filter((d): d is string => typeof d === "string");
    return { unavailable: flat, partiallyBooked: [], booked: flat };
  }
  return { unavailable: [], partiallyBooked: [], booked: [] };
}

// A vehicle's booked time windows — used to show occupied slots when the
// operator is picking times so they can find a free gap.
export interface BookedSlot {
  date: string;
  start_time: string | null;
  end_time: string | null;
  booking_reference: string;
  status: string;
}

export async function fetchVehicleBookedSlots(
  vehicleId: number,
  start_date?: string,
  end_date?: string
): Promise<BookedSlot[]> {
  const resp = await api.get<BookedSlot[] | { results: BookedSlot[] }>(
    `/api/admin/vehicles/${vehicleId}/booked-slots/`,
    { params: { start_date, end_date } }
  );
  const data = resp.data;
  if (Array.isArray(data)) return data;
  return data?.results ?? [];
}

// ---- Driver -------------------------------------------------------------

export async function fetchDriverSchedule(): Promise<DriverScheduleEvent[]> {
  const resp = await api.get<DriverScheduleEvent[] | { results: DriverScheduleEvent[] }>(
    "/api/driver/schedule/"
  );
  const data = resp.data;
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function fetchDriverTrip(bookingRef: string): Promise<Booking> {
  const resp = await api.get<Booking>(`/api/driver/trips/${bookingRef}/`);
  return resp.data;
}
