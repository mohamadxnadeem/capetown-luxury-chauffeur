import { api } from "./client";
import type { Experience } from "./types";

// The website's experiences API wraps each record in an outer envelope:
//   [{ experience: {...}, cover_photos: [...], average_rating, reviews }]
// We flatten here so callers see plain Experience objects. The auth model
// is public — no token needed.
interface ExperienceEnvelope {
  experience: Omit<Experience, "cover_photos"> & {
    cover_photos?: Experience["cover_photos"];
  };
  // The envelope also repeats cover_photos at the outer level — use the
  // nested one inside `experience` to stay consistent with the detail
  // endpoint shape.
  cover_photos?: Experience["cover_photos"];
  average_rating?: number;
  reviews?: unknown[];
}

export async function fetchExperiences(): Promise<Experience[]> {
  const resp = await api.get<ExperienceEnvelope[]>(
    "/api/experiences/all/"
  );
  return resp.data.map((env) => ({
    ...env.experience,
    cover_photos: env.experience.cover_photos ?? env.cover_photos ?? [],
  }));
}
