import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createVilla,
  deleteVilla,
  deleteVillaPhoto,
  fetchVilla,
  fetchVillaAvailability,
  fetchVillas,
  updateVilla,
  updateVillaPhoto,
  uploadVillaPhoto,
} from "@/api/villas";
import type {
  CreateVillaPayload,
  UpdateVillaPayload,
  VillaListFilters,
} from "@/api/types";

export function useVillas(filters?: VillaListFilters) {
  return useQuery({
    queryKey: ["admin", "villas", filters ?? {}],
    queryFn: () => fetchVillas(filters),
    // staleTime inherits QueryClient default (30s) — list data stays
    // fresh without hammering the backend on every screen re-open.
  });
}

export function useVilla(id: number | string | undefined) {
  return useQuery({
    queryKey: ["admin", "villa", id],
    queryFn: () => fetchVilla(id!),
    enabled: id != null,
  });
}

// Pulls the Nox-scraped availability for this villa. Backend caches ~1h,
// so refetching on every screen open is cheap. Disabled if no id yet.
export function useVillaAvailability(id: number | string | undefined) {
  return useQuery({
    queryKey: ["admin", "villa", id, "availability"],
    queryFn: () => fetchVillaAvailability(id!),
    enabled: id != null,
    staleTime: 60 * 60_000, // mirror backend cache TTL
  });
}

// ---- Mutations ---------------------------------------------------------

export function useCreateVilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVillaPayload) => createVilla(payload),
    onSuccess: (villa) => {
      qc.invalidateQueries({ queryKey: ["admin", "villas"] });
      qc.setQueryData(["admin", "villa", villa.id], villa);
    },
  });
}

export function useUpdateVilla(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateVillaPayload) => {
      if (id == null) throw new Error("Villa id is required for update.");
      return updateVilla(id, patch);
    },
    onSuccess: (villa) => {
      qc.invalidateQueries({ queryKey: ["admin", "villas"] });
      qc.invalidateQueries({ queryKey: ["admin", "villa", id] });
      qc.setQueryData(["admin", "villa", villa.id], villa);
    },
  });
}

export function useDeleteVilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => deleteVilla(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "villas"] });
      qc.removeQueries({ queryKey: ["admin", "villa", id] });
    },
  });
}

// ---- Photo mutations ---------------------------------------------------

export function useUploadVillaPhoto(villaId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      fileUri: string;
      filename?: string;
      mimeType?: string;
    }) => {
      if (villaId == null) throw new Error("Villa id required.");
      return uploadVillaPhoto(Number(villaId), args.fileUri, {
        filename: args.filename,
        mimeType: args.mimeType,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "villa", villaId] });
      qc.invalidateQueries({ queryKey: ["admin", "villas"] });
    },
  });
}

export function useUpdateVillaPhoto(villaId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      photoId: number;
      patch: { order?: number; is_featured?: boolean };
    }) => {
      if (villaId == null) throw new Error("Villa id required.");
      return updateVillaPhoto(Number(villaId), args.photoId, args.patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "villa", villaId] });
      qc.invalidateQueries({ queryKey: ["admin", "villas"] });
    },
  });
}

export function useDeleteVillaPhoto(villaId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => {
      if (villaId == null) throw new Error("Villa id required.");
      return deleteVillaPhoto(Number(villaId), photoId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "villa", villaId] });
      qc.invalidateQueries({ queryKey: ["admin", "villas"] });
    },
  });
}
