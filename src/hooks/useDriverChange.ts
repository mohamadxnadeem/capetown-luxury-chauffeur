import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBooking } from "@/api/bookings";
import { addBookingToGroup, convertBookingToGroup } from "@/api/bookingGroups";
import { formatApiError } from "@/api/errors";
import type {
  Booking,
  CreateBookingDayPayload,
  CreateBookingGroupChildPayload,
} from "@/api/types";
import { dayToPayload, splitDay, toApiTime } from "@/utils/driverChange";

export interface DriverChangeArgs {
  booking: Booking;
  // Group the booking belongs to. null/undefined = standalone booking, which
  // is first promoted to a group via convert-to-group.
  groupId?: number | null;
  changeTime: string; // HH:MM
  driverId: number;
  dates: string[]; // original day dates the change applies to
  clientRate: string;
  driverRate: string;
}

export class DriverChangeError extends Error {}

// Order matters. The backend rejects a second shift that overlaps the first
// on the same car, so the original is shortened FIRST, then the new shift is
// added. If adding fails, the original is restored. Every failure message
// says what state things were left in.
export function useDriverChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: DriverChangeArgs): Promise<number> => {
      const { booking } = a;
      if (!booking.car) throw new DriverChangeError("This booking has no vehicle.");
      const originalDays = booking.days ?? [];
      const picked = originalDays.filter((d) => a.dates.includes(d.date));
      if (picked.length === 0) throw new DriverChangeError("Pick at least one day.");

      const newDays: CreateBookingDayPayload[] = [];
      const patchedDays: CreateBookingDayPayload[] = [];
      for (const d of originalDays) {
        if (!a.dates.includes(d.date)) {
          patchedDays.push(dayToPayload(d));
          continue;
        }
        const split = splitDay(d, a.changeTime);
        if (typeof split === "string") throw new DriverChangeError(split);
        patchedDays.push({
          ...dayToPayload(d),
          end_time: toApiTime(split.firstEnd),
          end_next_day: split.firstEndNextDay,
        });
        newDays.push({
          date: split.secondDate,
          day_type: d.day_type,
          start_time: toApiTime(split.secondStart),
          end_time: toApiTime(split.secondEnd),
          end_next_day: split.secondEndNextDay,
          notes: null,
          client_rate: parseFloat(a.clientRate).toFixed(2),
          driver_rate: parseFloat(a.driverRate).toFixed(2),
          driver_payment_status: "unpaid",
        });
      }

      let groupId = a.groupId ?? null;
      let note = "";
      try {
        if (groupId == null) {
          try {
            const g = await convertBookingToGroup(booking.id, {
              additional_bookings: [],
            });
            groupId = g.id;
            note = ` ${booking.booking_reference} was turned into group ${g.group_reference}.`;
          } catch (err) {
            throw new DriverChangeError(
              `Could not turn the booking into a group: ${formatApiError(err)}\n\nNothing was changed.`
            );
          }
        }

        try {
          await updateBooking(booking.id, { days: patchedDays });
        } catch (err) {
          throw new DriverChangeError(
            `Could not shorten the original shift: ${formatApiError(err)}\n\nNo shift times were changed.${note}`
          );
        }

        const child: CreateBookingGroupChildPayload = {
          car: booking.car.id,
          driver: a.driverId,
          pickup_location: booking.pickup_location ?? "",
          dropoff_location: booking.dropoff_location ?? "",
          trip_description: booking.trip_description ?? "",
          days: newDays,
        };
        try {
          await addBookingToGroup(groupId, child);
        } catch (err) {
          const msg = formatApiError(err);
          try {
            await updateBooking(booking.id, { days: originalDays.map(dayToPayload) });
          } catch {
            throw new DriverChangeError(
              `Could not add the new shift: ${msg}\n\nThe original shift was already shortened to end at ${a.changeTime} and could NOT be restored. No new shift exists. Open ${booking.booking_reference} and set the end time back, or add the second shift by hand.${note}`
            );
          }
          throw new DriverChangeError(
            `Could not add the new shift: ${msg}\n\nThe original shift was restored to its first times. No new shift was created.${note}`
          );
        }
      } finally {
        qc.invalidateQueries({ queryKey: ["admin", "booking-groups"] });
        if (groupId != null) {
          qc.invalidateQueries({ queryKey: ["admin", "booking-group", groupId] });
        }
        qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
        qc.invalidateQueries({ queryKey: ["admin", "booking", booking.id] });
        qc.invalidateQueries({ queryKey: ["admin", "vehicles-available"] });
        qc.invalidateQueries({ queryKey: ["admin", "vehicle-unavailable-dates"] });
        qc.invalidateQueries({ queryKey: ["admin", "vehicle-booked-slots"] });
      }
      return groupId as number;
    },
  });
}
