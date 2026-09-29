import { api } from "./client";
import type {
  CreatePackagePayload,
  PackageListFilters,
  TravelPackage,
  UpdatePackagePayload,
  VillaPhoto,
} from "./types";

// ---- Package CRUD ------------------------------------------------------

export async function fetchPackages(
  filters?: PackageListFilters
): Promise<TravelPackage[]> {
  const params: Record<string, string | undefined> = {};
  if (filters?.is_active !== undefined) {
    params.is_active = filters.is_active ? "true" : "false";
  }
  if (filters?.is_featured !== undefined) {
    params.is_featured = filters.is_featured ? "true" : "false";
  }
  if (filters?.category) params.category = filters.category;
  if (filters?.search) params.search = filters.search;
  const resp = await api.get<TravelPackage[] | { results: TravelPackage[] }>(
    "/api/admin/packages/",
    { params }
  );
  return Array.isArray(resp.data) ? resp.data : (resp.data.results ?? []);
}

export async function fetchPackage(
  id: number | string
): Promise<TravelPackage> {
  const resp = await api.get<TravelPackage>(`/api/admin/packages/${id}/`);
  return resp.data;
}

export async function createPackage(
  payload: CreatePackagePayload
): Promise<TravelPackage> {
  const resp = await api.post<TravelPackage>(
    "/api/admin/packages/create/",
    payload
  );
  return resp.data;
}

export async function updatePackage(
  id: number | string,
  patch: UpdatePackagePayload
): Promise<TravelPackage> {
  const resp = await api.patch<TravelPackage>(
    `/api/admin/packages/${id}/update/`,
    patch
  );
  return resp.data;
}

export async function deletePackage(id: number | string): Promise<void> {
  await api.delete(`/api/admin/packages/${id}/delete/`);
}

// ---- Photo management --------------------------------------------------

// Same multipart pattern as villas — unique timestamped filename to avoid
// server-side collisions when two photos are picked seconds apart.
export async function uploadPackagePhoto(
  packageId: number,
  fileUri: string,
  options?: { filename?: string; mimeType?: string }
): Promise<VillaPhoto> {
  const ext = guessExtension(fileUri, options?.mimeType);
  const filename = `package-${packageId}-${Date.now()}.${ext}`;
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

  const resp = await api.post<VillaPhoto>(
    `/api/admin/packages/${packageId}/photos/upload/`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60_000,
    }
  );
  return resp.data;
}

export async function updatePackagePhoto(
  packageId: number,
  photoId: number,
  patch: { order?: number; is_featured?: boolean }
): Promise<VillaPhoto> {
  const resp = await api.patch<VillaPhoto>(
    `/api/admin/packages/${packageId}/photos/${photoId}/`,
    patch
  );
  return resp.data;
}

export async function deletePackagePhoto(
  packageId: number,
  photoId: number
): Promise<void> {
  // Same /delete/ convention as vehicle + villa photo deletes — the bare
  // /<photo_id>/ URL returns 405.
  await api.delete(
    `/api/admin/packages/${packageId}/photos/${photoId}/delete/`
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
