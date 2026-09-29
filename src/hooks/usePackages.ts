import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPackage,
  deletePackage,
  deletePackagePhoto,
  fetchPackage,
  fetchPackages,
  updatePackage,
  updatePackagePhoto,
  uploadPackagePhoto,
} from "@/api/packages";
import type {
  CreatePackagePayload,
  PackageListFilters,
  UpdatePackagePayload,
} from "@/api/types";

export function usePackages(filters?: PackageListFilters) {
  return useQuery({
    queryKey: ["admin", "packages", filters ?? {}],
    queryFn: () => fetchPackages(filters),
    // staleTime inherits QueryClient default (30s).
  });
}

export function usePackage(id: number | string | undefined) {
  return useQuery({
    queryKey: ["admin", "package", id],
    queryFn: () => fetchPackage(id!),
    enabled: id != null,
  });
}

// ---- Mutations ---------------------------------------------------------

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePackagePayload) => createPackage(payload),
    onSuccess: (pkg) => {
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
      qc.setQueryData(["admin", "package", pkg.id], pkg);
    },
  });
}

export function useUpdatePackage(id: number | string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdatePackagePayload) => {
      if (id == null) throw new Error("Package id is required for update.");
      return updatePackage(id, patch);
    },
    onSuccess: (pkg) => {
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
      qc.invalidateQueries({ queryKey: ["admin", "package", id] });
      qc.setQueryData(["admin", "package", pkg.id], pkg);
    },
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => deletePackage(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
      qc.removeQueries({ queryKey: ["admin", "package", id] });
    },
  });
}

// ---- Photo mutations ---------------------------------------------------

export function useUploadPackagePhoto(
  packageId: number | string | undefined
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      fileUri: string;
      filename?: string;
      mimeType?: string;
    }) => {
      if (packageId == null) throw new Error("Package id required.");
      return uploadPackagePhoto(Number(packageId), args.fileUri, {
        filename: args.filename,
        mimeType: args.mimeType,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "package", packageId] });
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
    },
  });
}

export function useUpdatePackagePhoto(
  packageId: number | string | undefined
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      photoId: number;
      patch: { order?: number; is_featured?: boolean };
    }) => {
      if (packageId == null) throw new Error("Package id required.");
      return updatePackagePhoto(Number(packageId), args.photoId, args.patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "package", packageId] });
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
    },
  });
}

export function useDeletePackagePhoto(
  packageId: number | string | undefined
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) => {
      if (packageId == null) throw new Error("Package id required.");
      return deletePackagePhoto(Number(packageId), photoId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "package", packageId] });
      qc.invalidateQueries({ queryKey: ["admin", "packages"] });
    },
  });
}
