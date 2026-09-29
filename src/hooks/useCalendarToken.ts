import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCalendarToken,
  rotateCalendarToken,
} from "@/api/calendar";

export function useCalendarToken() {
  return useQuery({
    queryKey: ["admin", "calendar-token"],
    queryFn: fetchCalendarToken,
    staleTime: 60_000,
  });
}

export function useRotateCalendarToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rotateCalendarToken(),
    onSuccess: (data) => {
      qc.setQueryData(["admin", "calendar-token"], data);
    },
  });
}
