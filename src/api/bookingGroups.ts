import { api } from "./client";
import type {
  BookingGroup,
  BookingGroupListFilters,
  CreateBookingGroupChildPayload,
  CreateBookingGroupPayload,
  UpdateBookingGroupPayload,
} from "./types";

export async function fetchAdminBookingGroups(
  params?: BookingGroupListFilters
): Promise<BookingGroup[]> {
  const resp = await api.get<BookingGroup[] | { results: BookingGroup[] }>(
    "/api/admin/booking-groups/",
    { params }
  );
  const data = resp.data;
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function fetchAdminBookingGroup(
  id: number | string
): Promise<BookingGroup> {
  const resp = await api.get<BookingGroup>(`/api/admin/booking-groups/${id}/`);
  return resp.data;
}

export async function createBookingGroup(
  payload: CreateBookingGroupPayload
): Promise<BookingGroup> {
  const resp = await api.post<BookingGroup>(
    "/api/admin/booking-groups/create/",
    payload
  );
  return resp.data;
}

export async function updateBookingGroup(
  id: number | string,
  patch: UpdateBookingGroupPayload
): Promise<BookingGroup> {
  const resp = await api.patch<BookingGroup>(
    `/api/admin/booking-groups/${id}/update/`,
    patch
  );
  return resp.data;
}

// Attach a NEW child booking to an existing group. Same shape as one entry
// in CreateBookingGroupPayload.bookings.
export async function addBookingToGroup(
  groupId: number | string,
  child: CreateBookingGroupChildPayload
): Promise<BookingGroup> {
  const resp = await api.post<BookingGroup>(
    `/api/admin/booking-groups/${groupId}/add-booking/`,
    child
  );
  return resp.data;
}

// Detach or delete a child booking. `delete=true` destroys the row; false
// (default) sets group=null so the booking survives as a standalone.
export async function removeBookingFromGroup(
  groupId: number | string,
  bookingId: number | string,
  hardDelete = false
): Promise<BookingGroup> {
  const resp = await api.post<BookingGroup>(
    `/api/admin/booking-groups/${groupId}/remove-booking/${bookingId}/`,
    undefined,
    { params: { delete: hardDelete ? "true" : "false" } }
  );
  return resp.data;
}

// Flips status → 'confirmed' and generates ONE Yoco link on the group.
export async function confirmBookingGroup(
  id: number | string
): Promise<BookingGroup> {
  const resp = await api.post<BookingGroup>(
    `/api/admin/booking-groups/${id}/confirm/`
  );
  return resp.data;
}

// Cascades cancel to all child bookings.
export async function cancelBookingGroup(
  id: number | string
): Promise<BookingGroup> {
  const resp = await api.post<BookingGroup>(
    `/api/admin/booking-groups/${id}/cancel/`
  );
  return resp.data;
}
