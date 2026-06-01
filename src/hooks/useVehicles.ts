import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createVehicle,
  deleteVehicle,
  deleteVehiclePhoto,
  fetchVehicle,
  fetchVehicles,
  rotateCalendarToken,
  updateVehicle,
  updateVehiclePhoto,
  uploadVehiclePhoto,
} from "@/api/vehicles";
import type {
  CreateVehiclePayload,
  UpdateVehiclePayload,
  VehicleListFilters,
} from "@/api/types";

export function useVehicles(filters?: VehicleListFilters) {
  return useQuery({
    // Including filters in the key means switching from "all" → "hidden"
    // doesn't show stale data while the new query runs.
    queryKey: ["admin", "vehicles", filters ?? {}],
    queryFn: () => fetchVehicles(filters),
    staleTime: 5 * 60_000,
  });
}

export function useVehicle(id: number | string | undefined) {
  return useQuery({
    queryKey: ["admin", "vehicle", id],
    queryFn: () => fetchVehicle(id!),
    enabled: id != null,
  });
}

// ---- Mutations ---------------------------------------------------------

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateVehiclePayload) => createVehicle(payload),
    onSuccess: (vehicle) => {
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
      qc.invalidateQueries({ queryKey: ["admin", "booking-form-options"] });
      qc.setQueryData(["admin", "vehicle", vehicle.id], vehicle);
    },
  });
}

export function useUpdateVehicle(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateVehiclePayload) => {
      if (id == null) throw new Error("Vehicle id is required for update.");
      return updateVehicle(id, patch);
    },
    onSuccess: (vehicle) => {
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicle", id] });
      qc.invalidateQueries({ queryKey: ["admin", "booking-form-options"] });
      qc.setQueryData(["admin", "vehicle", vehicle.id], vehicle);
    },
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => deleteVehicle(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
      qc.removeQueries({ queryKey: ["admin", "vehicle", id] });
      qc.invalidateQueries({ queryKey: ["admin", "booking-form-options"] });
    },
  });
}

// ---- Photo mutations ---------------------------------------------------

export function useUploadVehiclePhoto(vehicleId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      fileUri: string;
      filename?: string;
      mimeType?: string;
    }) => {
      if (vehicleId == null) throw new Error("Vehicle id required.");
      return uploadVehiclePhoto(Number(vehicleId), args.fileUri, {
        filename: args.filename,
        mimeType: args.mimeType,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "vehicle", vehicleId] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
    },
  });
}

export function useUpdateVehiclePhoto(vehicleId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      photoId: number;
      patch: { order?: number; is_featured?: boolean };
    }) => {
      if (vehicleId == null) throw new Error("Vehicle id required.");
      return updateVehiclePhoto(Number(vehicleId), args.photoId, args.patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "vehicle", vehicleId] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
    },
  });
}

export function useDeleteVehiclePhoto(vehicleId: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => {
      if (vehicleId == null) throw new Error("Vehicle id required.");
      return deleteVehiclePhoto(Number(vehicleId), photoId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "vehicle", vehicleId] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
    },
  });
}

export function useRotateCalendarToken(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (id == null) throw new Error("Vehicle id required.");
      return rotateCalendarToken(id);
    },
    onSuccess: () => {
      // Vehicle detail cache holds the now-stale token. Refetch to pick up
      // the new one server-side rather than trusting our response shape.
      qc.invalidateQueries({ queryKey: ["admin", "vehicle", id] });
      qc.invalidateQueries({ queryKey: ["admin", "vehicles"] });
    },
  });
}
