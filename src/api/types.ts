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
  // Nullable — an accommodation-only booking has no chauffeur, so backend
  // returns car: null. Any UI that touches booking.car.something MUST
  // guard with `?.` or fall back.
  car: Vehicle | null;
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
  // Yoco-hosted payment link the client uses to pay total_client_amount.
  // Backend creates this when the booking is confirmed; null until then.
  // is_paid flips to true via Yoco webhook on successful charge.
  payment_link?: string | null;
  is_paid?: boolean;
  // Proposal bundle add-ons. All optional — a plain vehicle booking has
  // them all empty. Operator assembles a full client proposal by adding
  // accommodation segments (each pointing at a villa or hotel), picking
  // day-tour experiences, and/or attaching pre-built packages. Backend
  // nests them on read; on write the app sends the corresponding ids (see
  // CreateBookingPayload).
  //
  // `villa` (single) is the legacy pre-segments field — kept for backward
  // compat until the backend migration lands. New code should prefer
  // accommodation_segments.
  villa?: Villa | null;
  accommodation_segments?: AccommodationSegment[];
  experiences?: Experience[];
  included_packages?: TravelPackage[];
  // When this booking belongs to a BookingGroup (multi-vehicle proposal),
  // both are populated. Standalone bookings leave them null. The mobile app
  // uses these to show a small group chip on booking cards and to route
  // taps to the group detail screen instead of the single-booking screen —
  // the client-facing payment link and total live on the group, not here.
  group_id?: number | null;
  group_reference?: string | null;
  // Which source created the booking. New non-'manual' values get a small
  // badge in the UI so the operator can tell agent-drafted bookings apart
  // from ones they created themselves.
  source?: "manual" | "email_agent" | "whatsapp_agent";
  created_at: string;
  updated_at: string;
}

// Returns [firstDate, lastDate] for a booking. Tries every date source the
// backend serializers ever provide so no booking silently disappears from
// the calendar / upcoming list:
//   1. Nested days[] — always on detail responses, sometimes on list.
//   2. Top-level start_date / end_date — should be on list responses.
//   3. accommodation_segments[] — a fallback for accommodation-only
//      bookings (car === null), which have no days[] but do have segment
//      dates.
// Empty strings only when none of the above are populated.
export function bookingDateRange(b: Booking): [string, string] {
  if (Array.isArray(b.days) && b.days.length > 0) {
    return [b.days[0].date, b.days[b.days.length - 1].date];
  }
  if (b.start_date) {
    return [b.start_date, b.end_date ?? b.start_date];
  }
  if (
    Array.isArray(b.accommodation_segments) &&
    b.accommodation_segments.length > 0
  ) {
    const segs = [...b.accommodation_segments].sort((x, y) =>
      x.start_date.localeCompare(y.start_date)
    );
    return [segs[0].start_date, segs[segs.length - 1].end_date];
  }
  return ["", ""];
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
  // null = accommodation-only booking with no chauffeur. Backend must
  // treat this as a valid state (no per-day rates, no driver).
  car: number | null;
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
  // Proposal bundle add-ons — all optional. Send the FK ids; the backend
  // resolves to nested objects on read.
  //
  // For accommodation, prefer `accommodation_segments` (per-date villa or
  // hotel). `villa_id` is the legacy single-villa field; keep sending it
  // for backward compat until backend fully migrates to segments.
  villa_id?: number | null;
  accommodation_segments?: AccommodationSegmentPayload[];
  experience_ids?: number[];
  package_ids?: number[];
  // Operator-set total for accommodation-only bookings where per-day
  // vehicle rates don't apply. Ignored when car is set (backend derives
  // total from sum of days[].client_rate in that case).
  custom_total_client_amount?: string;
}

// POST /api/admin/drivers/create/ — minimal payload. Backend creates the
// underlying User behind the scenes; the app only needs name + WhatsApp.
export interface CreateDriverPayload {
  full_name: string;
  whatsapp: string;
}

// ---- Villa (luxury rental properties) -----------------------------------

export type VillaArea =
  | "camps_bay"
  | "clifton"
  | "bantry_bay"
  | "constantia"
  | "franschhoek"
  | "stellenbosch"
  | "other";

export interface VillaPhoto {
  id: number;
  cover_photos: string; // full S3 URL — matches VehicleCoverPhoto shape
  order: number;
  is_featured: boolean;
}

export interface Villa {
  id: number;
  name: string;
  slug: string;
  location: string;
  area: VillaArea;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  price_per_night: string; // decimal string
  price_currency: string; // "ZAR"
  short_description: string;
  description: string; // HTML
  features: string[];
  nox_property_id: string;
  nox_booking_url: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  cover_photos?: VillaPhoto[];
  // Flat URL list — useful when we only need URLs. Optional because some
  // legacy responses may omit it.
  images?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateVillaPayload {
  name: string;
  slug?: string;
  location?: string;
  area?: VillaArea;
  bedrooms?: number;
  bathrooms?: number;
  max_guests?: number;
  price_per_night?: string;
  price_currency?: string;
  short_description?: string;
  description?: string;
  features?: string[];
  nox_property_id?: string;
  nox_booking_url?: string;
  is_featured?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export type UpdateVillaPayload = Partial<CreateVillaPayload>;

export interface VillaListFilters {
  search?: string;
  area?: VillaArea;
  is_active?: boolean;
  is_featured?: boolean;
}

// ---- Hotel (mirror of Villa with 2 hotel-specific fields) ---------------

export interface HotelPhoto {
  id: number;
  hotel: number;
  cover_photos: string; // S3 URL
  order: number;
  is_featured: boolean;
}

export interface Hotel {
  id: number;
  name: string;
  slug: string;
  location: string;
  // Backend returns display strings like "Camps Bay" or "city-bowl" here,
  // NOT the VillaArea enum — keep as plain string.
  area: string;
  // These four can all be null on hotels that haven't been fully filled in.
  star_rating: number | null;
  bedrooms_available: number | null;
  max_guests: number | null;
  price_per_night_from: string | null; // decimal string
  room_types: string[];
  price_currency: string;
  short_description: string;
  description: string; // HTML
  features: string[];
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  cover_photos?: HotelPhoto[];
  images?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateHotelPayload {
  name: string;
  slug?: string;
  location?: string;
  area?: VillaArea;
  star_rating?: number;
  room_types?: string[];
  bedrooms_available?: number;
  max_guests?: number;
  price_per_night_from?: string;
  price_currency?: string;
  short_description?: string;
  description?: string;
  features?: string[];
  is_featured?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export type UpdateHotelPayload = Partial<CreateHotelPayload>;

export interface HotelListFilters {
  search?: string;
  area?: VillaArea;
  is_active?: boolean;
  is_featured?: boolean;
}

// ---- Accommodation segments (per-date villa/hotel on a booking) ---------

export type AccommodationKind = "villa" | "hotel";

// Read shape — backend nests the full villa/hotel object on the segment
// so the client-facing confirmation page can render images/details
// without a second round-trip.
export interface AccommodationSegment {
  id?: number;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD (inclusive)
  kind: AccommodationKind;
  villa: Villa | null;
  hotel: Hotel | null;
  notes: string;
  order: number;
}

// Write shape — send FK ids, backend resolves. Send in the order you want
// them to display.
export interface AccommodationSegmentPayload {
  start_date: string;
  end_date: string;
  kind: AccommodationKind;
  villa_id?: number | null;
  hotel_id?: number | null;
  notes?: string;
}

// ---- Travel Packages ----------------------------------------------------

export type PackageCategory =
  | "cape_town_week"
  | "winelands_escape"
  | "family_cape_town"
  | "custom";

export interface PackageItineraryDay {
  day: number;
  title: string;
  description: string;
}

export interface TravelPackage {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  category: PackageCategory;
  duration_nights: number | null;
  max_guests: number | null;
  price_from: string | null; // decimal string
  price_currency: string;
  short_description: string;
  description: string; // HTML
  highlights: string[];
  includes: string[];
  excludes: string[];
  itinerary: PackageItineraryDay[];
  // Linked villa (nested on the read response). When sending writes the
  // backend expects `villa_id` instead — see CreatePackagePayload.
  villa: Villa | null;
  vehicle_type: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  // Same dual photo shape as villas — rich objects + flat URL list.
  cover_photos?: VillaPhoto[];
  images?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreatePackagePayload {
  name: string;
  slug?: string;
  tagline?: string;
  category?: PackageCategory;
  duration_nights?: number;
  max_guests?: number;
  price_from?: string;
  price_currency?: string;
  short_description?: string;
  description?: string;
  highlights?: string[];
  includes?: string[];
  excludes?: string[];
  itinerary?: PackageItineraryDay[];
  villa_id?: number | null;
  vehicle_type?: string;
  is_featured?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export type UpdatePackagePayload = Partial<CreatePackagePayload>;

export interface PackageListFilters {
  search?: string;
  category?: PackageCategory;
  is_active?: boolean;
  is_featured?: boolean;
}

// ---- Experiences (day tours) -------------------------------------------

// The /api/experiences/all/ endpoint wraps each row in an outer envelope:
//   [{ experience: {...}, cover_photos: [...], average_rating, reviews }]
// We flatten in the API layer so consumers see plain Experience objects.
export interface ExperienceCoverPhoto {
  id: number;
  experience: number;
  cover_photos: string; // S3 URL
  order: number;
  is_featured: boolean;
}

export interface Experience {
  id: number;
  title: string;
  slug: string;
  location: string;
  duration: string; // free-form, e.g. "8 hours"
  price_from: string; // decimal string
  price_to: string | null;
  currency: string;
  short_description: string;
  highlight: string | null;
  is_featured: boolean;
  sort_order: number;
  cover_photos: ExperienceCoverPhoto[];
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

// ---- Booking groups (multi-vehicle proposals) ---------------------------

// A BookingGroup bundles N vehicle bookings under one client-facing
// proposal: one URL, one combined total, one Yoco payment link. Individual
// child bookings still exist for per-vehicle scheduling and driver views —
// this is the shared wrapper that lets the client see everything and pay
// once.
export interface BookingGroup {
  id: number;
  group_reference: string; // e.g. "CTC-GRP-A3F9"
  title: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes: string;
  status: BookingStatus;
  total_client_amount: string; // decimal string, sum of children
  currency: string; // "ZAR"
  // Yoco-hosted checkout URL for the WHOLE group amount. Null until the
  // group is confirmed; child bookings do NOT get individual payment_link
  // URLs when they belong to a group.
  payment_link: string | null;
  is_paid: boolean;
  paid_at: string | null;
  source: "manual" | "email_agent" | "whatsapp_agent";
  bookings: Booking[];
  created_at: string;
  updated_at: string;
}

// Payload for POST /api/admin/booking-groups/create/. Each entry in
// `bookings` inherits customer_name/email/phone and status from the group
// level, so those fields are stripped from CreateBookingPayload here.
// Title is optional on children too — the group-level title serves as
// the default, and the backend can synthesize per-child titles if needed
// (e.g. "Vehicle 2 of proposal <group_reference>").
export type CreateBookingGroupChildPayload = Omit<
  CreateBookingPayload,
  "customer_name" | "customer_email" | "customer_phone" | "status" | "title"
> & { title?: string };

export interface CreateBookingGroupPayload {
  title: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  notes?: string;
  status?: BookingStatus;
  bookings: CreateBookingGroupChildPayload[];
}

// PATCH payload for /api/admin/booking-groups/<id>/update/ — every field
// optional. Backend accepts a subset per call.
export interface UpdateBookingGroupPayload {
  title?: string;
  notes?: string;
  status?: BookingStatus;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
}

export interface BookingGroupListFilters {
  status?: BookingStatus;
  source?: "manual" | "email_agent" | "whatsapp_agent";
  search?: string;
  offset?: number;
  limit?: number;
}

// ---- Mailbot inbox ------------------------------------------------------

export type InboxChannel = "email" | "whatsapp";
export type ConversationStatus = "active" | "archived" | "human_only";
export type AgentActionKind =
  | "draft_reply"
  | "draft_booking"
  | "draft_booking_group"
  | "escalate";
export type AgentActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired";

export interface InboxConversationSummary {
  conversation_id: number;
  channel: InboxChannel;
  contact_name: string;
  contact_identifier: string;
  status: ConversationStatus;
  last_message_preview: string;
  last_message_at: string;
  unread_count: number;
  pending_approval_count: number;
  linked_booking_id: number | null;
}

export interface InboxMessage {
  id: number;
  direction: "in" | "out";
  sender: "client" | "agent" | "operator";
  body: string;
  sent_at: string;
  read_at: string | null;
}

export interface AgentActionSummary {
  id: number;
  kind: AgentActionKind;
  status: AgentActionStatus;
  confidence: number;
  draft_text: string;
  reason: string;
  // For draft_booking: id of the pending CarBooking. For
  // draft_booking_group: id of the first child booking (fetch the group via
  // that booking's group_id).
  output_booking_id: number | null;
  created_at: string;
}

export interface InboxConversationDetail {
  conversation_id: number;
  channel: InboxChannel;
  contact_name: string;
  contact_identifier: string;
  status: ConversationStatus;
  human_only_until: string | null;
  linked_booking_id: number | null;
  messages: InboxMessage[];
  pending_actions: AgentActionSummary[];
}

export interface MailbotStatus {
  kill_switch: boolean;
  meta_quality_tier: string | null;
  drafts_pending_count: number;
  last_message_processed_at: string | null;
  gmail_connected: boolean;
  gmail_watch_expires_at: string | null;
}

// ---- Admin calendar feed (personal iCal) --------------------------------

export interface CalendarTokenResponse {
  token: string | null;
  ical_url: string | null;
  webcal_url: string | null;
}
