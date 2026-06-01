import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDriver, fetchDrivers } from "@/api/drivers";
import type { CreateDriverPayload } from "@/api/types";

export function useDrivers() {
  return useQuery({
    queryKey: ["admin", "drivers"],
    queryFn: fetchDrivers,
    staleTime: 5 * 60_000,
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDriverPayload) => createDriver(payload),
    onSuccess: () => {
      // Drivers appear in both the standalone admin list and the bookings
      // form picker — invalidate both.
      qc.invalidateQueries({ queryKey: ["admin", "drivers"] });
      qc.invalidateQueries({ queryKey: ["admin", "booking-form-options"] });
    },
  });
}
