import type { NavigatorScreenParams } from "@react-navigation/native";

export type AdminTabsParamList = {
  Home: undefined;
  Finance: undefined;
  Vehicles: undefined;
  // The New tab can be opened with a vehicleId pre-selected (from
  // VehicleDetail's "Book this vehicle") and/or dates pre-filled (from the
  // availability search).
  New: { vehicleId?: number; dates?: string[] } | undefined;
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
  // Manage drivers — list + add new (name + WhatsApp only).
  DriverList: undefined;
};
