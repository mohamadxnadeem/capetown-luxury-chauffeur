import { api, tokenStorage } from "./client";
import { AuthTokens, DriverProfile, Role } from "./types";

export async function login(username: string, password: string): Promise<AuthTokens> {
  const resp = await api.post<AuthTokens>("/api/users/login/", { username, password });
  await tokenStorage.set(resp.data.access, resp.data.refresh);
  return resp.data;
}

export async function logout() {
  // Best-effort: clear push token on the server before wiping local creds.
  try {
    await api.delete("/api/driver/me/push-token/");
  } catch {
    // Admin users will 404 here — that's fine.
  }
  await tokenStorage.clear();
}

// Detect role: if /api/driver/me/ returns 200, this is a driver; 404 means
// admin (assumes any logged-in non-driver user is staff). Anything else
// bubbles up so the caller can show an error.
export async function detectRole(): Promise<{ role: Role; driver: DriverProfile | null }> {
  try {
    const resp = await api.get<DriverProfile>("/api/driver/me/");
    return { role: "driver", driver: resp.data };
  } catch (err: unknown) {
    const status =
      typeof err === "object" && err !== null && "response" in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 404) {
      return { role: "admin", driver: null };
    }
    throw err;
  }
}

export async function registerPushToken(expoPushToken: string) {
  await api.post("/api/driver/me/push-token/", { expo_push_token: expoPushToken });
}
