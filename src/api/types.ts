// IMPORTANT: These types are best-effort guesses based on endpoint names and
// Django REST conventions. The real backend was not reachable when this was
// scaffolded (the API base URL was a placeholder). Hit each endpoint with curl
// once the Railway URL is set and update these shapes to match. Treat any field
// you haven't verified as suspect.

export type Role = "admin" | "driver";

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface DriverProfile {
  id: number;
  user: number;
  full_name?: string;
  phone?: string;
  // TODO verify shape from GET /api/driver/me/
  [key: string]: unknown;
}

export interface BookingDay {
  id: number;
  booking: number;
  date: string; // ISO date
  start_time?: string | null;
  end_time?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  notes?: string | null;
  // TODO verify
  [key: string]: unknown;
}

export interface Booking {
  id: number;
  booking_ref?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  vehicle?: number | null;
  driver?: number | null;
  start_date?: string;
  end_date?: string;
  status?: string;
  total_price?: string | number;
  days?: BookingDay[];
  // TODO verify shape against GET /api/admin/bookings/<id>/
  [key: string]: unknown;
}

// Driver-side schedule event. The driver endpoint returns calendar events
// rather than full bookings; verify whether these include a booking_ref to
// drill in with GET /api/driver/trips/<booking_ref>/.
export interface DriverScheduleEvent {
  id: number | string;
  date: string; // ISO date
  start_time?: string | null;
  end_time?: string | null;
  booking_ref?: string;
  customer_name?: string;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  vehicle?: string | null;
  status?: string;
  // TODO verify shape from GET /api/driver/schedule/
  [key: string]: unknown;
}

export interface BlockedDate {
  id: number;
  date: string;
  reason?: string | null;
  driver?: number;
  // TODO verify
  [key: string]: unknown;
}

export interface Vehicle {
  id: number;
  name?: string;
  registration?: string;
  // TODO verify
  [key: string]: unknown;
}

export interface Driver {
  id: number;
  full_name?: string;
  phone?: string;
  // TODO verify
  [key: string]: unknown;
}

export interface PaymentSummary {
  start_date?: string;
  end_date?: string;
  total?: number | string;
  trips?: unknown[];
  // TODO verify
  [key: string]: unknown;
}
