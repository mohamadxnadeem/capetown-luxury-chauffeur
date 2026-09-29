import { api } from "./client";
import type {
  CreateHotelPayload,
  Hotel,
  HotelListFilters,
  HotelPhoto,
  UpdateHotelPayload,
} from "./types";

// ---- Hotel CRUD --------------------------------------------------------

export async function fetchHotels(
  filters?: HotelListFilters
): Promise<Hotel[]> {
  const params: Record<string, string | undefined> = {};
  if (filters?.is_active !== undefined) {
    params.is_active = filters.is_active ? "true" : "false";
  }
  if (filters?.is_featured !== undefined) {
    params.is_featured = filters.is_featured ? "true" : "false";
  }
  if (filters?.area) params.area = filters.area;
  if (filters?.search) params.search = filters.search;
  const resp = await api.get<Hotel[] | { results: Hotel[] }>(
    "/api/admin/hotels/",
    { params }
  );
  return Array.isArray(resp.data) ? resp.data : (resp.data.results ?? []);
}

export async function fetchHotel(id: number | string): Promise<Hotel> {
  const resp = await api.get<Hotel>(`/api/admin/hotels/${id}/`);
  return resp.data;
}

export async function createHotel(
  payload: CreateHotelPayload
): Promise<Hotel> {
  const resp = await api.post<Hotel>("/api/admin/hotels/create/", payload);
  return resp.data;
}

export async function updateHotel(
  id: number | string,
  patch: UpdateHotelPayload
): Promise<Hotel> {
  const resp = await api.patch<Hotel>(
    `/api/admin/hotels/${id}/update/`,
    patch
  );
  return resp.data;
}

export async function deleteHotel(id: number | string): Promise<void> {
  await api.delete(`/api/admin/hotels/${id}/delete/`);
}

// ---- Photo management --------------------------------------------------

export async function uploadHotelPhoto(
  hotelId: number,
  fileUri: string,
  options?: { filename?: string; mimeType?: string }
): Promise<HotelPhoto> {
  const ext = guessExtension(fileUri, options?.mimeType);
  const filename = `hotel-${hotelId}-${Date.now()}.${ext}`;
  const mimeType =
    options?.mimeType ?? guessMime(fileUri) ?? "image/jpeg";

  const form = new FormData();
  const filePart = {
    uri: fileUri,
    name: filename,
    type: mimeType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  form.append("cover_photos", filePart);

  const resp = await api.post<HotelPhoto>(
    `/api/admin/hotels/${hotelId}/photos/upload/`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60_000,
    }
  );
  return resp.data;
}

export async function updateHotelPhoto(
  hotelId: number,
  photoId: number,
  patch: { order?: number; is_featured?: boolean }
): Promise<HotelPhoto> {
  const resp = await api.patch<HotelPhoto>(
    `/api/admin/hotels/${hotelId}/photos/${photoId}/`,
    patch
  );
  return resp.data;
}

export async function deleteHotelPhoto(
  hotelId: number,
  photoId: number
): Promise<void> {
  // Same /delete/ suffix convention as villa + package photo deletes.
  await api.delete(
    `/api/admin/hotels/${hotelId}/photos/${photoId}/delete/`
  );
}

// ---- Helpers -----------------------------------------------------------

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
