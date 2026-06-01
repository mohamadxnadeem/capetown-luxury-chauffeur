// Types verified against docs/MOBILE_APP_API.md (the backend blueprint).
// All decimals come back as strings — parse with parseFloat only for display
// arithmetic. All datetimes are ISO 8601 (timezone Africa/Johannesburg).

export type Role = "admin" | "driver";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type DayType = "full_day" | "half_day";
export type DriverPaymentStatus = "unpaid" | "paid";
export type VehicleCategory = "budget" | "premium";

// ---- Auth ----------------------------------------------------------------

export interface AuthTokens {
  access: string;
  refresh: string;
}

// POST /api/users/login/ also returns user info inline with the tokens.
export interface LoginResponse extends AuthTokens {
  _id: number;
  username: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

// GET /api/users/profile/
export interface UserProfile {
  _id: number;
  username: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

// ---- Driver --------------------------------------------------------------

// GET /api/driver/me/ — the user object is nested when fetched as "me".
export interface DriverProfile {
  id: number;
  user: UserProfile;
  full_name: string;
  phone: string;
  whatsapp: string;
  default_daily_rate: string;
  is_active: boolean;
}

// Nested driver shape used inside Booking.car.driver and Booking.driver.
export interface DriverNested {
  id: number;
  full_name: string;
  phone: string;
  whatsapp: string;
  default_daily_rate: string;
  is_active: boolean;
}

// ---- Vehicle (Carsforhire) ----------------------------------------------

export interface VehicleCoverPhoto {
  id: number;
  cover_photos: string; // full S3 URL
  order: number;
  is_featured: boolean;
}

export interface Vehicle {
  id: number;
  title: string;
  slug: string;
  number_of_seats: number;
  price: string;
  price_from: string;
  price_to: string | null;
  currency: string;
  category: VehicleCategory;
  vehicle_type: string;
  short_description: string;
  highlight: string;
  chauffeur_service_text: string;
  luggage_capacity: number;
  features: string[];
  ideal_for: string[];
  body?: string; // HTML — present on detail, absent in some list responses
  driver: DriverNested | null;
  registration_number: string;
  is_active: boolean;
  // Controls whether the vehicle is included in the PUBLIC /api/cars-for-hire/
  // response. False = hidden from the marketing site but still bookable in
  // the app. Optional in the type for backward compat with older API responses.
  is_public?: boolean;
  // Opaque per-vehicle UUID that gates the public calendar feed (JSON + iCal).
  // Returned only by admin endpoints, never by the public website endpoints.
  // Rotate via POST /api/admin/vehicles/<id>/calendar-token/rotate/.
  calendar_token?: string;
  cover_photos?: VehicleCoverPhoto[];
}

// POST /api/admin/vehicles/create/ payload. All optional except title — the
// backend fills in sensible defaults for the rest (slug from title, empty
// string for text fields, empty array for lists, true for booleans).
export interface CreateVehiclePayload {
  title: string;
  short_description?: string;
  highlight?: string;
  chauffeur_service_text?: string;
  vehicle_type?: string;
  number_of_seats?: number;
  luggage_capacity?: number;
  category?: VehicleCategory;
  price?: string;
  price_from?: string;
  price_to?: string | null;
  currency?: string;
  features?: string[];
  ideal_for?: string[];
  body?: string;
  registration_number?: string;
  // Backend expects `driver_id` on write (FK by id). Read responses nest
  // the driver as `driver: { id, full_name, ... }`.
  driver_id?: number | null;
  is_active?: boolean;
  is_public?: boolean;
}

// PATCH /api/admin/vehicles/<id>/update/ accepts the same fields, all optional.
export type UpdateVehiclePayload = Partial<CreateVehiclePayload>;

// Response from POST /api/admin/vehicles/<id>/calendar-token/rotate/.
export interface CalendarTokenRotateResponse {
  calendar_token: string;
  calendar_urls: {
    json: string;
    ics: string;
  };
}

// Filters accepted by GET /api/admin/vehicles/
export interface VehicleListFilters {
  is_public?: boolean;
  is_active?: boolean;
  category?: VehicleCategory;
  driver?: number;
  search?: string;
}

// ---- Booking -------------------------------------------------------------

export interface BookingDay {
  id: number;
  date: string; // YYYY-MM-DD
  day_type: DayType;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  notes: string | null;
  client_rate?: string; // omitted on driver-view trips
  driver_rate: string;
  driver_payment_status: DriverPaymentStatus;
  driver_paid_at: string | null;
  profit?: string; // omitted on driver-view trips
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: number;
  booking_reference: string;
  title: string;
  status: BookingStatus;
  car: Vehicle;
  driver: DriverNested | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  pickup_location: string;
  dropoff_location: string;
  trip_description: string;
  // NB: optional — the admin list serializer omits days[] for brevity. Detail
  // endpoints always include it. Guard at use sites with bookingDateRange().
  days?: BookingDay[];
  // List responses may include these top-level date fields (computed from
  // the day rows server-side); detail responses do not. Either source is
  // fine — see bookingDateRange() below.
  start_date?: string;
  end_date?: string;
  total_client_amount?: string; // omitted on driver-view
  total_driver_amount: string;
  total_profit?: string; // omitted on driver-view
  total_days: number;
  is_multi_day: boolean;
  created_at: string;
  updated_at: string;
}

// Returns [firstDate, lastDate] for a booking, preferring nested days when
// present (detail responses) and falling back to top-level start_date/end_date
// (list responses). Empty strings when no date info is available.
export function bookingDateRange(b: Booking): [string, string] {
  if (Array.isArray(b.days) && b.days.length > 0) {
    return [b.days[0].date, b.days[b.days.length - 1].date];
  }
  return [b.start_date ?? "", b.end_date ?? b.start_date ?? ""];
}

// POST /api/admin/bookings/create/ payload — booking_reference is server-generated.
export interface CreateBookingDayPayload {
  date: string;
  day_type: DayType;
  start_time?: string | null;
  end_time?: string | null;
  notes?: string | null;
  client_rate: string;
  driver_rate: string;
  driver_payment_status?: DriverPaymentStatus;
}

export interface CreateBookingPayload {
  car: number;
  // null = no driver assigned (booking can be created unassigned and a driver
  // attached later). A number assigns that specific driver.
  driver?: number | null;
  title: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string;
  pickup_location: string;
  dropoff_location: string;
  trip_description: string;
  status?: BookingStatus;
  days: CreateBookingDayPayload[];
}

// POST /api/admin/drivers/create/ — minimal payload. Backend creates the
// underlying User behind the scenes; the app only needs name + WhatsApp.
export interface CreateDriverPayload {
  full_name: string;
  whatsapp: string;
}

// ---- Booking-form options -----------------------------------------------

export interface Choice<T extends string = string> {
  value: T;
  label: string;
}

export interface BookingFormOptions {
  status_choices: Choice<BookingStatus>[];
  day_type_choices: Choice<DayType>[];
  driver_payment_status_choices: Choice<DriverPaymentStatus>[];
  drivers: DriverNested[];
  vehicles: Vehicle[];
}

// ---- Vehicle availability -----------------------------------------------

export interface VehicleAvailabilityEntry {
  vehicle: Vehicle;
  driver: DriverNested | null;
  available: boolean;
  reason: string;
}

export interface VehiclesAvailableResponse {
  start_date: string;
  end_date: string;
  available_count: number;
  unavailable_count: number;
  available_vehicles: VehicleAvailabilityEntry[];
  unavailable_vehicles: VehicleAvailabilityEntry[];
}

// ---- Driver schedule / blocked dates ------------------------------------

export interface DriverScheduleBookingEvent {
  id: string; // "booking-123"
  type: "booking";
  date: string;
  day_type: DayType;
  day_type_display: string;
  booking_reference: string;
  status: BookingStatus;
  vehicle: string;
  driver: string;
  driver_whatsapp: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  pickup_location: string;
  dropoff_location: string;
  trip_description: string;
  notes: string | null;
  start_time: string | null;
  end_time: string | null;
  driver_rate: string;
  driver_payment_status: DriverPaymentStatus;
  driver_paid_at: string | null;
  is_multi_day: boolean;
  days_count: number;
  detail_url: string;
}

export interface DriverScheduleBlockedEvent {
  id: string; // "blocked-9"
  type: "blocked";
  date: string;
  reason: string | null;
  title: string;
}

export type DriverScheduleEvent =
  | DriverScheduleBookingEvent
  | DriverScheduleBlockedEvent;

export interface BlockedDate {
  id: number;
  date: string;
  reason: string | null;
  created_at?: string;
  driver?: number;
}

// ---- Driver payment summary --------------------------------------------

export interface PaymentSummary {
  total_driver_amount: string;
  unpaid_driver_amount: string;
  paid_driver_amount: string;
  total_days: number;
}

// ---- Bare driver shape (admin list) -------------------------------------

export type Driver = DriverProfile;
