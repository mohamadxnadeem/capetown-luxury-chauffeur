import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBooking,
  fetchAdminBooking,
  fetchAdminBookings,
  fetchBookingFormOptions,
  fetchDriverTrip,
  fetchVehicleBookedSlots,
  fetchVehicleUnavailableDates,
  fetchVehiclesAvailable,
  updateBooking,
} from "@/api/bookings";
import type { BookingStatus, CreateBookingPayload } from "@/api/types";

export function useAdminBookings(filters?: {
  status?: string;
  driver?: number;
  car?: number;
  start_date?: string;
  end_date?: string;
  customer?: string;
  booking_reference?: string;
}) {
  return useQuery({
    // Filters are part of the key so a car-scoped list and the full list are
    // cached separately. Invalidating ["admin","bookings"] still hits both.
    queryKey: ["admin", "bookings", filters ?? {}],
    queryFn: () => fetchAdminBookings(filters),
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

export function useBookingFormOptions() {
  return useQuery({
    queryKey: ["admin", "booking-form-options"],
    queryFn: fetchBookingFormOptions,
    staleTime: 5 * 60_000, // 5 min — drivers/vehicles change rarely during a session
  });
}

export function useVehiclesAvailable(
  start_date: string | undefined,
  end_date: string | undefined
) {
  return useQuery({
    queryKey: ["admin", "vehicles-available", start_date, end_date],
    queryFn: () => fetchVehiclesAvailable(start_date!, end_date),
    enabled: !!start_date,
  });
}

export function useVehicleUnavailableDates(
  vehicleId: number | undefined,
  start_date?: string,
  end_date?: string
) {
  return useQuery({
    queryKey: ["admin", "vehicle-unavailable-dates", vehicleId, start_date, end_date],
    queryFn: () => fetchVehicleUnavailableDates(vehicleId!, start_date, end_date),
    enabled: vehicleId != null,
  });
}

// A vehicle's booked time windows, so the operator can see occupied slots
// and pick a free gap when choosing booking times.
export function useVehicleBookedSlots(
  vehicleId: number | undefined,
  start_date?: string,
  end_date?: string
) {
  return useQuery({
    queryKey: ["admin", "vehicle-booked-slots", vehicleId, start_date, end_date],
    queryFn: () => fetchVehicleBookedSlots(vehicleId!, start_date, end_date),
    enabled: vehicleId != null,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBookingPayload) => createBooking(payload),
    onSuccess: () => {
      // After a create, the calendar and any vehicle-availability queries
      // are stale. Refetch them so the new booking shows up and the date
      // picker grays out the right days next time.
      qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicles-available"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicle-unavailable-dates"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicle-booked-slots"] });
    },
  });
}

// PATCH a booking — used by the "Change dates" and "Cancel" flows. Pass
// only the fields you want to change (the backend supports partial update).
export function useUpdateBooking(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Partial<CreateBookingPayload> & {
        status?: BookingStatus;
        driver?: number | null;
      }
    ) => {
      if (id == null) throw new Error("Booking id is required for update.");
      return updateBooking(id, patch);
    },
    onSuccess: (booking) => {
      qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
      qc.invalidateQueries({ queryKey: ["admin", "booking", id] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicles-available"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicle-unavailable-dates"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicle-booked-slots"] });
      // Seed the booking-detail cache with the fresh response so the screen
      // updates immediately without a second round-trip.
      qc.setQueryData(["admin", "booking", booking.id], booking);
    },
  });
}
