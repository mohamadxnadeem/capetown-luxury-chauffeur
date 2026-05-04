import { useQuery } from "@tanstack/react-query";
import { fetchAdminBooking, fetchAdminBookings, fetchDriverTrip } from "@/api/bookings";

export function useAdminBookings() {
  return useQuery({
    queryKey: ["admin", "bookings"],
    queryFn: fetchAdminBookings,
  });
}

export function useAdminBooking(id: number | string | undefined) {
  return useQuery({
    queryKey: ["admin", "booking", id],
    queryFn: () => fetchAdminBooking(id!),
    enabled: id != null,
  });
}

export function useDriverTrip(bookingRef: string | undefined) {
  return useQuery({
    queryKey: ["driver", "trip", bookingRef],
    queryFn: () => fetchDriverTrip(bookingRef!),
    enabled: !!bookingRef,
  });
}
