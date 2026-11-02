import type { NavigatorScreenParams } from "@react-navigation/native";

export type AdminTabsParamList = {
  Home: undefined;
  Inbox: undefined;
  Finance: undefined;
  Vehicles: undefined;
  // Combined Villas + Hotels tab with a top toggle. Kept as narrow as
  // possible to stay comfortable on small phones.
  Accommodation: undefined;
  // Groups tab — list of multi-vehicle proposal groups (CTC-GRP-*).
  // Replaced the Packages tab (which was less used); Packages are still
  // reachable from the Profile tab's navigation rows.
  Groups: undefined;
  Profile: undefined;
};

export type DriverTabsParamList = {
  Schedule: undefined;
  Blocked: undefined;
  Payments: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<AdminTabsParamList> | NavigatorScreenParams<DriverTabsParamList> | undefined;
  // Either bookingId (admin) or bookingRef (driver) is provided.
  BookingDetail: { bookingId?: number | string; bookingRef?: string };
  // Edit an existing booking — reuses the New Booking form, prefilled.
  BookingEdit: { bookingId: number };
  VehicleDetail: { vehicleId: number };
  // Edit when vehicleId is provided; create-new when omitted.
  VehicleEdit: { vehicleId?: number };
  // Availability search — pick dates, see which vehicles are free.
  VehicleSearch: undefined;
  // Month calendar view — tap a day to see all trips for that day.
  BookingCalendar: undefined;
  // Manage drivers — list + add new (name + WhatsApp only).
  DriverList: undefined;
  // Villa management. List opens from the Accommodation tab; detail
  // shows availability + edit + book buttons; edit covers both create
  // (no villaId) and edit modes.
  VillaList: undefined;
  VillaDetail: { villaId: number };
  VillaEdit: { villaId?: number };
  // Hotel management. Same shape as villas.
  HotelList: undefined;
  HotelDetail: { hotelId: number };
  HotelEdit: { hotelId?: number };
  // Package management. The list is reached from the Profile tab's
  // navigation rows (Packages replaced the old Packages tab with the
  // Groups tab). Edit covers both create and edit modes.
  PackageList: undefined;
  PackageEdit: { packageId?: number };
  // Booking creation moved from a tab to a stack screen so the Packages
  // tab could take its slot. Same params shape as before, plus optional
  // preselectAccommodation for launching from a Villa/Hotel detail — the
  // form enters "no chauffeur" mode with that accommodation pre-added.
  NewBooking:
    | {
        vehicleId?: number;
        dates?: string[];
        preselectAccommodation?: { kind: "villa" | "hotel"; id: number };
      }
    | undefined;
  // Multi-vehicle proposal wrapper. Shows combined total, one Yoco link,
  // one client-facing proposal URL. Child bookings navigated to their own
  // BookingDetail from within.
  BookingGroupDetail: { groupId: number };
  // Mailbot inbox — list of client conversations (email/WhatsApp) with
  // pending AI drafts to approve or reject.
  Inbox: undefined;
  InboxConversation: { conversationId: number };
  MailbotSettings: undefined;
};
