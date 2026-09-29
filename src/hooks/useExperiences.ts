import { useQuery } from "@tanstack/react-query";
import { fetchExperiences } from "@/api/experiences";

// Public read-only — same key shape as our admin queries so devtools
// stay readable, but no filters since the endpoint doesn't accept any.
export function useExperiences() {
  return useQuery({
    queryKey: ["admin", "experiences"],
    queryFn: fetchExperiences,
    // staleTime inherits QueryClient default (30s).
  });
}
