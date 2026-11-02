import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteBookingDay,
  splitBookingDay,
  updateBookingDay,
} from "@/api/bookings";
import type { BookingDay, SplitDayPayload, UpdateBookingDayPayload } from "@/api/types";
import { mergeBackPatch } from "@/utils/dayShifts";

function useRefresh(bookingId: number | string | undefined) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
    qc.invalidateQueries({ queryKey: ["admin", "booking", bookingId] });
    qc.invalidateQueries({ queryKey: ["admin", "booking-groups"] });
    qc.invalidateQueries({ queryKey: ["admin", "booking-group"] });
    qc.invalidateQueries({ queryKey: ["admin", "vehicles-available"] });
    qc.invalidateQueries({ queryKey: ["admin", "vehicle-booked-slots"] });
  };
}

export function useUpdateDay(bookingId: number | string | undefined) {
  const refresh = useRefresh(bookingId);
  return useMutation({
    mutationFn: (a: { id: number; patch: UpdateBookingDayPayload }) =>
      updateBookingDay(a.id, a.patch),
    onSettled: refresh,
  });
}

export function useSplitDay(bookingId: number | string | undefined) {
  const refresh = useRefresh(bookingId);
  return useMutation({
    mutationFn: (a: { id: number; payload: SplitDayPayload }) =>
      splitBookingDay(a.id, a.payload),
    onSettled: refresh,
  });
}

// Undo a split: delete the second shift, then extend the first to its end.
export function useRemoveSplit(bookingId: number | string | undefined) {
  const refresh = useRefresh(bookingId);
  return useMutation({
    mutationFn: async (a: { first: BookingDay; second: BookingDay }) => {
      await deleteBookingDay(a.second.id);
      try {
        await updateBookingDay(a.first.id, mergeBackPatch(a.first, a.second));
      } catch (err) {
        throw new Error(
          "The second shift was removed, but the first shift could not be extended. Edit its end time to finish."
        );
      }
    },
    onSettled: refresh,
  });
}
