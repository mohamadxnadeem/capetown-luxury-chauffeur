import { api } from "./client";
import type {
  CreateVillaPayload,
  UpdateVillaPayload,
  Villa,
  VillaListFilters,
  VillaPhoto,
} from "./types";

// ---- Villa CRUD --------------------------------------------------------

export async function fetchVillas(
  filters?: VillaListFilters
): Promise<Villa[]> {
  const params: Record<string, string | number | undefined> = {};
  if (filters?.is_active !== undefined) {
    params.is_active = filters.is_active ? "true" : "false";
  }
  if (filters?.is_featured !== undefined) {
    params.is_featured = filters.is_featured ? "true" : "false";
  }
  if (filters?.area) params.area = filters.area;
  if (filters?.search) params.search = filters.search;
  const resp = await api.get<Villa[] | { results: Villa[] }>(
    "/api/admin/villas/",
    { params }
  );
  return Array.isArray(resp.data) ? resp.data : (resp.data.results ?? []);
}

export async function fetchVilla(id: number | string): Promise<Villa> {
  const resp = await api.get<Villa>(`/api/admin/villas/${id}/`);
  return resp.data;
}

export async function createVilla(
  payload: CreateVillaPayload
): Promise<Villa> {
  const resp = await api.post<Villa>("/api/admin/villas/create/", payload);
  return resp.data;
}

export async function updateVilla(
  id: number | string,
  patch: UpdateVillaPayload
): Promise<Villa> {
  const resp = await api.patch<Villa>(
    `/api/admin/villas/${id}/update/`,
    patch
  );
  return resp.data;
}

export async function deleteVilla(id: number | string): Promise<void> {
  await api.delete(`/api/admin/villas/${id}/delete/`);
}

// ---- Nox availability --------------------------------------------------

// Backend scrapes the villa's nox_booking_url and returns the dates the
// property is blocked. Dates are ISO (YYYY-MM-DD). `unavailable` is the
// full no-go set (fully booked + blackout). `checkin_only` / `checkout_only`
// are the partial-availability sets the operator may want to flag
// separately on the calendar.
export interface VillaAvailability {
  unavailable: string[];
  checkin_only: string[];
  checkout_only: string[];
  // ISO date — last day the property can be booked, from Nox's
  // data-max-allowed-date attribute. Optional in case the backend can't
  // parse it.
  max_allowed_date?: string | null;
  // When the backend last refreshed the scrape. Useful for showing a
  // "last updated" hint.
  fetched_at?: string | null;
}

export async function fetchVillaAvailability(
  id: number | string
): Promise<VillaAvailability> {
  const resp = await api.get<VillaAvailability>(
    `/api/admin/villas/${id}/availability/`
  );
  return resp.data;
}

// ---- Photo management --------------------------------------------------

// Mirrors uploadVehiclePhoto — multipart upload with unique timestamped
// filename so two photos picked seconds apart never collide on the server.
export async function uploadVillaPhoto(
  villaId: number,
  fileUri: string,
  options?: { filename?: string; mimeType?: string }
): Promise<VillaPhoto> {
  const ext = guessExtension(fileUri, options?.mimeType);
  const filename = `villa-${villaId}-${Date.now()}.${ext}`;
  const mimeType =
    options?.mimeType ?? guessMime(fileUri) ?? "image/jpeg";

  const form = new FormData();
  const filePart = {
    uri: fileUri,
    name: filename,
    type: mimeType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  // Backend's primary field name is `cover_photos`, but it also accepts
  // `file` or `image` (per the spec).
  form.append("cover_photos", filePart);

  const resp = await api.post<VillaPhoto>(
    `/api/admin/villas/${villaId}/photos/upload/`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60_000,
    }
  );
  return resp.data;
}

export async function updateVillaPhoto(
  villaId: number,
  photoId: number,
  patch: { order?: number; is_featured?: boolean }
): Promise<VillaPhoto> {
  const resp = await api.patch<VillaPhoto>(
    `/api/admin/villas/${villaId}/photos/${photoId}/`,
    patch
  );
  return resp.data;
}

export async function deleteVillaPhoto(
  villaId: number,
  photoId: number
): Promise<void> {
  // Backend convention: bare /<photo_id>/ accepts GET/PATCH but returns 405
  // for DELETE — destroys are wired to the /delete/ suffix (same as
  // vehicle photo deletes).
  await api.delete(
    `/api/admin/villas/${villaId}/photos/${photoId}/delete/`
  );
}

// ---- Helpers (copied from vehicles.ts) ---------------------------------

function guessExtension(uri: string, mime?: string): string {
  if (mime?.startsWith("image/")) {
    const m = mime.slice(6).toLowerCase();
    if (m === "jpeg" || m === "jpg") return "jpg";
    if (m === "png") return "png";
    if (m === "webp") return "webp";
    if (m === "heic") return "heic";
  }
  const tail = uri.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  if (tail && ["jpg", "jpeg", "png", "webp", "heic"].includes(tail)) {
    return tail === "jpeg" ? "jpg" : tail;
  }
  return "jpg";
}

function guessMime(uri: string): string | null {
  const tail = uri.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  if (!tail) return null;
  if (tail === "jpg" || tail === "jpeg") return "image/jpeg";
  if (tail === "png") return "image/png";
  if (tail === "webp") return "image/webp";
  if (tail === "heic") return "image/heic";
  return null;
}
