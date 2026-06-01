import { api } from "./client";
import type {
  CalendarTokenRotateResponse,
  CreateVehiclePayload,
  UpdateVehiclePayload,
  Vehicle,
  VehicleCoverPhoto,
  VehicleListFilters,
} from "./types";

// ---- Vehicle CRUD ------------------------------------------------------

export async function fetchVehicles(
  filters?: VehicleListFilters
): Promise<Vehicle[]> {
  // Booleans need to go to the wire as "true"/"false" strings so axios
  // doesn't serialize them as numbers on some backends.
  const params: Record<string, string | number | undefined> = {};
  if (filters?.is_public !== undefined) {
    params.is_public = filters.is_public ? "true" : "false";
  }
  if (filters?.is_active !== undefined) {
    params.is_active = filters.is_active ? "true" : "false";
  }
  if (filters?.category) params.category = filters.category;
  if (filters?.driver != null) params.driver = filters.driver;
  if (filters?.search) params.search = filters.search;
  const resp = await api.get<Vehicle[] | { results: Vehicle[] }>(
    "/api/admin/vehicles/",
    { params }
  );
  return Array.isArray(resp.data) ? resp.data : (resp.data.results ?? []);
}

export async function fetchVehicle(id: number | string): Promise<Vehicle> {
  const resp = await api.get<Vehicle>(`/api/admin/vehicles/${id}/`);
  return resp.data;
}

export async function createVehicle(
  payload: CreateVehiclePayload
): Promise<Vehicle> {
  const resp = await api.post<Vehicle>("/api/admin/vehicles/create/", payload);
  return resp.data;
}

export async function updateVehicle(
  id: number | string,
  patch: UpdateVehiclePayload
): Promise<Vehicle> {
  const resp = await api.patch<Vehicle>(
    `/api/admin/vehicles/${id}/update/`,
    patch
  );
  return resp.data;
}

export async function deleteVehicle(id: number | string): Promise<void> {
  await api.delete(`/api/admin/vehicles/${id}/delete/`);
}

// Rotates the calendar_token, invalidating any URLs that were previously
// shared with partners.
export async function rotateCalendarToken(
  id: number | string
): Promise<CalendarTokenRotateResponse> {
  const resp = await api.post<CalendarTokenRotateResponse>(
    `/api/admin/vehicles/${id}/calendar-token/rotate/`,
    {}
  );
  return resp.data;
}

// ---- Photo management --------------------------------------------------

// Uploads a single image file as multipart/form-data. fileUri is the local
// URI from expo-image-picker. The filename is made unique with a timestamp
// suffix so the backend can't accidentally collide two uploads (which would
// surface as "every vehicle shows the same image").
export async function uploadVehiclePhoto(
  vehicleId: number,
  fileUri: string,
  options?: { filename?: string; mimeType?: string }
): Promise<VehicleCoverPhoto> {
  const ext = guessExtension(fileUri, options?.mimeType);
  // Always inject a timestamp so two photos picked moments apart never
  // share a name on the server.
  const filename = `vehicle-${vehicleId}-${Date.now()}.${ext}`;
  const mimeType =
    options?.mimeType ?? guessMime(fileUri) ?? "image/jpeg";

  const form = new FormData();
  // React Native's FormData accepts {uri, name, type} for file fields. We
  // also send the file under multiple field names because different Django
  // image upload views look for different conventions (cover_photos / image
  // / file). The backend ignores the extras.
  const filePart = {
    uri: fileUri,
    name: filename,
    type: mimeType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  form.append("image", filePart);

  const resp = await api.post<VehicleCoverPhoto>(
    `/api/admin/vehicles/${vehicleId}/photos/upload/`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      // Multipart uploads can take longer than the default 15s — bump to 60s.
      timeout: 60_000,
    }
  );
  return resp.data;
}

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

export async function updateVehiclePhoto(
  vehicleId: number,
  photoId: number,
  patch: { order?: number; is_featured?: boolean }
): Promise<VehicleCoverPhoto> {
  const resp = await api.patch<VehicleCoverPhoto>(
    `/api/admin/vehicles/${vehicleId}/photos/${photoId}/`,
    patch
  );
  return resp.data;
}

export async function deleteVehiclePhoto(
  vehicleId: number,
  photoId: number
): Promise<void> {
  // Backend uses a /delete/ suffix on destroy actions (same convention as
  // vehicles/<id>/delete/). The bare DRF /<photo_id>/ URL returns 405.
  await api.delete(
    `/api/admin/vehicles/${vehicleId}/photos/${photoId}/delete/`
  );
}
