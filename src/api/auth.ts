import { api, tokenStorage } from "./client";
import { DriverProfile, LoginResponse, Role } from "./types";

export async function login(username: string, password: string): Promise<LoginResponse> {
  const resp = await api.post<LoginResponse>("/api/users/login/", {
    username,
    password,
  });
  await tokenStorage.set(resp.data.access, resp.data.refresh);
  // Persist role from the login response so cold-start bootstrap can skip
  // the /api/driver/me/ round-trip for known admins (that endpoint always
  // 404s for them and just clutters the logs).
  await tokenStorage.setRole(resp.data.isAdmin ? "admin" : "driver");
  return resp.data;
}

export async function logout() {
  // Clear the push token on the correct endpoint for the role. Both are
  // best-effort — if the network's down we still want to clear locally.
  const role = await tokenStorage.getRole();
  const path =
    role === "driver"
      ? "/api/driver/me/push-token/"
      : role === "admin"
        ? "/api/admin/push-token/"
        : null;
  if (path) {
    try {
      await api.delete(path);
    } catch {
      // Ignore — server-side token will time itself out eventually anyway.
    }
  }
  await tokenStorage.clear();
}

// Detect role at cold-start bootstrap.
//
// Prefers the role persisted at login time (fast, no network). Falls back
// to hitting /api/driver/me/ only when we don't have a stored role — that's
// the transition case for anyone who was signed in before role-persistence
// was added.
//
// For the network path we use a 60s timeout because it's the first request
// the app makes on a cold start; the backend may need a moment to spin up.
export async function detectRole(): Promise<{
  role: Role;
  driver: DriverProfile | null;
}> {
  const stored = await tokenStorage.getRole();
  if (stored === "admin") {
    return { role: "admin", driver: null };
  }
  if (stored === "driver") {
    // Fetch the driver profile for state; if this fails, degrade to a
    // driver role with no profile rather than bouncing to login — the
    // stored role is authoritative.
    try {
      const resp = await api.get<DriverProfile>("/api/driver/me/", {
        timeout: 60_000,
      });
      return { role: "driver", driver: resp.data };
    } catch {
      return { role: "driver", driver: null };
    }
  }

  // Legacy path: no stored role. Probe the driver endpoint; 404 = admin.
  try {
    const resp = await api.get<DriverProfile>("/api/driver/me/", {
      timeout: 60_000,
    });
    await tokenStorage.setRole("driver");
    return { role: "driver", driver: resp.data };
  } catch (err: unknown) {
    const status =
      typeof err === "object" && err !== null && "response" in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 404) {
      await tokenStorage.setRole("admin");
      return { role: "admin", driver: null };
    }
    throw err;
  }
}

export async function registerPushToken(expoPushToken: string) {
  // Route to the correct per-role endpoint. Both accept the same body.
  // Backend uses this to send push notifications to the operator (admin)
  // or driver — reminders 7d / 1d / 2h / 30m before bookings start.
  const role = await tokenStorage.getRole();
  const path =
    role === "driver"
      ? "/api/driver/me/push-token/"
      : role === "admin"
        ? "/api/admin/push-token/"
        : null;
  if (!path) return;
  await api.post(path, { expo_push_token: expoPushToken });
}
