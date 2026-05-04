import { useQuery } from "@tanstack/react-query";
import { fetchDriverSchedule } from "@/api/bookings";

export function useDriverSchedule() {
  return useQuery({
    queryKey: ["driver", "schedule"],
    queryFn: fetchDriverSchedule,
  });
}
