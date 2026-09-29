import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHotel,
  deleteHotel,
  deleteHotelPhoto,
  fetchHotel,
  fetchHotels,
  updateHotel,
  updateHotelPhoto,
  uploadHotelPhoto,
} from "@/api/hotels";
import type {
  CreateHotelPayload,
  HotelListFilters,
  UpdateHotelPayload,
} from "@/api/types";

export function useHotels(filters?: HotelListFilters) {
  return useQuery({
    queryKey: ["admin", "hotels", filters ?? {}],
    queryFn: () => fetchHotels(filters),
    // staleTime inherits QueryClient default (30s).
  });
}

export function useHotel(id: number | string | undefined) {
  return useQuery({
    queryKey: ["admin", "hotel", id],
    queryFn: () => fetchHotel(id!),
    enabled: id != null,
  });
}

export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHotelPayload) => createHotel(payload),
    onSuccess: (hotel) => {
      qc.invalidateQueries({ queryKey: ["admin", "hotels"] });
      qc.setQueryData(["admin", "hotel", hotel.id], hotel);
    },
  });
}

export function useUpdateHotel(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateHotelPayload) => {
      if (id == null) throw new Error("Hotel id is required for update.");
      return updateHotel(id, patch);
    },
    onSuccess: (hotel) => {
      qc.invalidateQueries({ queryKey: ["admin", "hotels"] });
      qc.invalidateQueries({ queryKey: ["admin", "hotel", id] });
      qc.setQueryData(["admin", "hotel", hotel.id], hotel);
    },
  });
}

export function useDeleteHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => deleteHotel(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "hotels"] });
      qc.removeQueries({ queryKey: ["admin", "hotel", id] });
    },
  });
}

export function useUploadHotelPhoto(hotelId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      fileUri: string;
      filename?: string;
      mimeType?: string;
    }) => {
      if (hotelId == null) throw new Error("Hotel id required.");
      return uploadHotelPhoto(Number(hotelId), args.fileUri, {
        filename: args.filename,
        mimeType: args.mimeType,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "hotel", hotelId] });
      qc.invalidateQueries({ queryKey: ["admin", "hotels"] });
    },
  });
}

export function useUpdateHotelPhoto(hotelId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      photoId: number;
      patch: { order?: number; is_featured?: boolean };
    }) => {
      if (hotelId == null) throw new Error("Hotel id required.");
      return updateHotelPhoto(Number(hotelId), args.photoId, args.patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "hotel", hotelId] });
      qc.invalidateQueries({ queryKey: ["admin", "hotels"] });
    },
  });
}

export function useDeleteHotelPhoto(hotelId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => {
      if (hotelId == null) throw new Error("Hotel id required.");
      return deleteHotelPhoto(Number(hotelId), photoId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "hotel", hotelId] });
      qc.invalidateQueries({ queryKey: ["admin", "hotels"] });
    },
  });
}
