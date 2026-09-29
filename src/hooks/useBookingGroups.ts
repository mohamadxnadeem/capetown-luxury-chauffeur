import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addBookingToGroup,
  cancelBookingGroup,
  confirmBookingGroup,
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
