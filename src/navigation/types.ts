export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
  // Either bookingId (admin) or bookingRef (driver) is provided.
  BookingDetail: { bookingId?: number | string; bookingRef?: string };
};
