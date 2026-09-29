import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addBookingToGroup,
  cancelBookingGroup,
  confirmBookingGroup,
  convertBookingToGroup,
  createBookingGroup,
  fetchAdminBookingGroup,
  fetchAdminBookingGroups,
  removeBookingFromGroup,
  updateBookingGroup,
} from "@/api/bookingGroups";
import type {
  BookingGroup,
  BookingGroupListFilters,
  CreateBookingGroupChildPayload,
  CreateBookingGroupPayload,
  UpdateBookingGroupPayload,
} from "@/api/types";

export function useAdminBookingGroups(filters?: BookingGroupListFilters) {
  return useQuery({
    queryKey: ["admin", "booking-groups", filters ?? {}],
    queryFn: () => fetchAdminBookingGroups(filters),
  });
}

export function useAdminBookingGroup(id: number | string | undefined) {
  return useQuery({
    queryKey: ["admin", "booking-group", id],
    queryFn: () => fetchAdminBookingGroup(id!),
    enabled: id != null,
  });
}

// Any group mutation invalidates: the groups list, this group's detail,
// AND the bookings list — child bookings' group_id / group_reference
// change so their card renderings need to refresh.
function invalidateGroupCaches(
  qc: ReturnType<typeof useQueryClient>,
  groupId?: number | string
) {
  qc.invalidateQueries({ queryKey: ["admin", "booking-groups"] });
  if (groupId != null) {
    qc.invalidateQueries({ queryKey: ["admin", "booking-group", groupId] });
  }
  qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
  qc.invalidateQueries({ queryKey: ["admin", "vehicles-available"] });
  qc.invalidateQueries({ queryKey: ["admin", "vehicle-unavailable-dates"] });
  qc.invalidateQueries({ queryKey: ["admin", "vehicle-booked-slots"] });
}

export function useCreateBookingGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBookingGroupPayload) =>
      createBookingGroup(payload),
    onSuccess: (group) => {
      qc.setQueryData(["admin", "booking-group", group.id], group);
      invalidateGroupCaches(qc, group.id);
    },
  });
}

export function useUpdateBookingGroup(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateBookingGroupPayload) => {
      if (id == null) throw new Error("Group id is required for update.");
      return updateBookingGroup(id, patch);
    },
    onSuccess: (group) => {
      qc.setQueryData(["admin", "booking-group", group.id], group);
      invalidateGroupCaches(qc, group.id);
    },
  });
}

export function useAddBookingToGroup(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (child: CreateBookingGroupChildPayload) => {
      if (id == null) throw new Error("Group id is required.");
      return addBookingToGroup(id, child);
    },
    onSuccess: (group) => {
      qc.setQueryData(["admin", "booking-group", group.id], group);
      invalidateGroupCaches(qc, group.id);
    },
  });
}

export function useRemoveBookingFromGroup(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      hardDelete,
    }: {
      bookingId: number | string;
      hardDelete?: boolean;
    }) => {
      if (id == null) throw new Error("Group id is required.");
      return removeBookingFromGroup(id, bookingId, hardDelete);
    },
    onSuccess: (group) => {
      qc.setQueryData(["admin", "booking-group", group.id], group);
      invalidateGroupCaches(qc, group.id);
    },
  });
}

export function useConfirmBookingGroup(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (id == null) throw new Error("Group id is required.");
      return confirmBookingGroup(id);
    },
    onSuccess: (group: BookingGroup) => {
      qc.setQueryData(["admin", "booking-group", group.id], group);
      invalidateGroupCaches(qc, group.id);
    },
  });
}

// Promote an existing standalone booking into a new BookingGroup. On
// success the caller navigates to the returned group's detail screen —
// the standalone booking is now grouped and shouldn't be treated as a
// standalone anywhere else. We also refresh the standalone booking's
// detail cache so its group_id / group_reference update instantly if
// the operator navigates back to it.
export function useConvertBookingToGroup(
  bookingId: number | string | undefined
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      title?: string;
      notes?: string;
      additional_bookings: Parameters<typeof convertBookingToGroup>[1]["additional_bookings"];
    }) => {
      if (bookingId == null) throw new Error("Booking id is required.");
      return convertBookingToGroup(bookingId, args);
    },
    onSuccess: (group) => {
      qc.setQueryData(["admin", "booking-group", group.id], group);
      qc.invalidateQueries({ queryKey: ["admin", "booking-groups"] });
      qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
      if (bookingId != null) {
        qc.invalidateQueries({
          queryKey: ["admin", "booking", bookingId],
        });
      }
      qc.invalidateQueries({ queryKey: ["admin", "vehicles-available"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicle-unavailable-dates"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicle-booked-slots"] });
    },
  });
}

export function useCancelBookingGroup(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (id == null) throw new Error("Group id is required.");
      return cancelBookingGroup(id);
    },
    onSuccess: (group: BookingGroup) => {
      qc.setQueryData(["admin", "booking-group", group.id], group);
      invalidateGroupCaches(qc, group.id);
    },
  });
}
