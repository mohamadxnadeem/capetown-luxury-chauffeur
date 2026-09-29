import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "auth.access";
const REFRESH_KEY = "auth.refresh";
// Persisted "admin" or "driver" — set at login from the response's isAdmin
// flag. Lets the cold-start bootstrap skip the /api/driver/me/ round-trip
// for known admins (that endpoint 404s for them, which was cluttering logs).
const ROLE_KEY = "auth.role";

const apiBaseUrl =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "https://example.invalid";

export const tokenStorage = {
  async getAccess() {
    return SecureStore.getItemAsync(ACCESS_KEY);
  },
  async getRefresh() {
    return SecureStore.getItemAsync(REFRESH_KEY);
  },
  async getRole(): Promise<"admin" | "driver" | null> {
    const raw = await SecureStore.getItemAsync(ROLE_KEY);
    return raw === "admin" || raw === "driver" ? raw : null;
  },
  async set(access: string, refresh: string) {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  async setAccess(access: string) {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
  },
  async setRole(role: "admin" | "driver") {
    await SecureStore.setItemAsync(ROLE_KEY, role);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(ROLE_KEY);
  },
};

export const api = axios.create({
  baseURL: apiBaseUrl,
  // 30s so a slow-but-eventually-resolving request has time; anything
  // longer is a stuck server and should surface an error rather than a
  // permanent spinner. Cold-start auth (detectRole) overrides with 60s.
  timeout: 30_000,
});

// Hook a handler that fires when refresh fails — the app uses this to bounce
// the user back to the login screen.
let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(handler: (() => void) | null) {
  onAuthFailure = handler;
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const access = await tokenStorage.getAccess();
  if (access) {
    config.headers.set("Authorization", `Bearer ${access}`);
  }
  return config;
});

interface RetriableConfig extends AxiosRequestConfig {
  _retried?: boolean;
}

let refreshInflight: Promise<string | null> | null = null;

// Single-flight refresh — N concurrent 401s share ONE refresh call so the
// rotated refresh token isn't blacklisted out from under us by parallel
// refresh attempts.
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const refresh = await tokenStorage.getRefresh();
      if (!refresh) return null;
      const resp = await axios.post(
        `${apiBaseUrl}/api/users/token/refresh/`,
        { refresh },
        { timeout: 15000 }
      );
      const newAccess: string | undefined = resp.data?.access;
      const newRefresh: string | undefined = resp.data?.refresh;
      if (!newAccess) {
        console.warn("[auth] refresh response missing access token");
        return null;
      }
      // ROTATE_REFRESH_TOKENS is enabled server-side — the response carries
      // a fresh refresh token and the old one is rotated. Persist BOTH
      // atomically; missing the new refresh = next refresh fails.
      if (newRefresh) {
        await tokenStorage.set(newAccess, newRefresh);
      } else {
        // Backend without rotation — keep the existing refresh token, just
        // update access.
        await tokenStorage.setAccess(newAccess);
      }
      return newAccess;
    } catch (err) {
      console.warn(
        "[auth] refresh failed:",
        (err as { response?: { status?: number } })?.response?.status ??
          (err as Error)?.message
      );
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

// Bail-to-login helper. Clears tokens then triggers the navigator swap
// (AppNavigator registers an onAuthFailure handler that flips the auth store).
async function bailToLogin(): Promise<void> {
  await tokenStorage.clear();
  onAuthFailure?.();
}

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // Only the 401 path triggers refresh; everything else passes through.
    if (status !== 401 || !original) {
      return Promise.reject(error);
    }

    // The refresh / login calls themselves can't be refreshed — let the
    // 401 propagate to the caller.
    const url = original.url ?? "";
    if (
      url.includes("/api/users/token/refresh/") ||
      url.includes("/api/users/login/")
    ) {
      return Promise.reject(error);
    }

    // Second 401 on the same request (we already refreshed once and the
    // retry still failed) — auth is hosed, bail to login.
    if (original._retried) {
      await bailToLogin();
      return Promise.reject(error);
    }

    original._retried = true;
    const newAccess = await refreshAccessToken();
    if (!newAccess) {
      // Refresh failed — bail to login.
      await bailToLogin();
      return Promise.reject(error);
    }

    // Retry the original request. The request interceptor will pull the
    // fresh access token from storage and attach it. If THIS retry also
    // 401s, we hit the `_retried` branch above and bail.
    return api.request(original);
  }
);

export { apiBaseUrl };
