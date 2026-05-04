import { api } from "./client";
import { Booking, DriverScheduleEvent } from "./types";

// Admin
export async function fetchAdminBookings(): Promise<Booking[]> {
  const resp = await api.get<Booking[] | { results: Booking[] }>("/api/admin/bookings/");
  // Handle both paginated and bare-list responses; verify against backend.
  const data = resp.data;
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function fetchAdminBooking(id: number | string): Promise<Booking> {
  const resp = await api.get<Booking>(`/api/admin/bookings/${id}/`);
  return resp.data;
}

// Driver
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
