import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "auth.access";
const REFRESH_KEY = "auth.refresh";
// Persisted "admin" or "driver", set at login from the response's isAdmin
// flag. Lets the cold-start bootstrap skip the /api/driver/me/ round-trip
// for known admins (that endpoint 404s for them, which was cluttering logs).
const ROLE_KEY = "auth.role";

// Refresh on foreground once the access token is this old. Access tokens
// live 60 min server-side, so this renews before the first tap 401s.
const ACCESS_MAX_AGE_MS = 50 * 60 * 1000;

const apiBaseUrl =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  "https://example.invalid";

// Bumped on every login and sign out. A refresh that started under an older
// epoch must not write tokens back (would resurrect a signed-out session) or
// wipe them (would sign out a fresh login).
let sessionEpoch = 0;

// Refresh token is written BEFORE access: if the app dies between the two
// writes we hold the new refresh (still usable) and an old access (just
// 401s and refreshes), never a blacklisted refresh next to a fresh access.
async function writeTokens(access: string, refresh: string | undefined) {
  if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  await SecureStore.setItemAsync(ACCESS_KEY, access);
}

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
  // Used by login: starts a new session.
  async set(access: string, refresh: string) {
    sessionEpoch += 1;
    await writeTokens(access, refresh);
  },
  async setRole(role: "admin" | "driver") {
    await SecureStore.setItemAsync(ROLE_KEY, role);
  },
  async clear() {
    sessionEpoch += 1;
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

// Hook a handler that fires when the session is definitely dead. The app
// uses this to bounce the user back to the login screen.
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

// True when the server rejected the access token itself. The backend lists
// SessionAuthentication before JWTAuthentication, so DRF turns an expired
// JWT into 403 with code "token_not_valid" rather than 401. A plain 403
// (real permission denial) is NOT a token problem.
export function isTokenRejected(err: unknown): boolean {
  const resp = (err as AxiosError<{ code?: unknown }>)?.response;
  if (!resp) return false;
  if (resp.status === 401) return true;
  return resp.status === 403 && resp.data?.code === "token_not_valid";
}

// Set on errors we reject when the token needed renewing but the server
// could not be reached. The user stays signed in; formatApiError shows a
// connection message instead of "session expired".
export interface SessionRenewUnavailableError {
  sessionRenewUnavailable?: boolean;
}

// ok: new tokens stored. invalid: the refresh endpoint said the refresh
// token is dead (401/400, or 403 token_not_valid), the only case that signs
// out. unavailable: no response, timeout or 5xx; keep the session and try
// again on the next request.
export type RefreshOutcome =
  | { status: "ok"; access: string }
  | { status: "invalid" }
  | { status: "unavailable" };

interface RetriableConfig extends AxiosRequestConfig {
  _retried?: boolean;
}

let refreshInflight: Promise<RefreshOutcome> | null = null;

// Single-flight refresh: N concurrent 401s share ONE refresh call so the
// rotated refresh token isn't blacklisted out from under us by parallel
// refresh attempts.
function refreshAccessToken(): Promise<RefreshOutcome> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async (): Promise<RefreshOutcome> => {
    const epoch = sessionEpoch;
    try {
      const refresh = await tokenStorage.getRefresh();
      if (!refresh) return { status: "invalid" };
      const resp = await axios.post(
        `${apiBaseUrl}/api/users/token/refresh/`,
        { refresh },
        { timeout: 15000 }
      );
      const newAccess: string | undefined = resp.data?.access;
      const newRefresh: string | undefined = resp.data?.refresh;
      if (!newAccess) {
        console.warn("[auth] refresh response missing access token");
        return { status: "unavailable" };
      }
      // Signed out (or signed in as someone else) while this was in flight.
      if (epoch !== sessionEpoch) return { status: "unavailable" };
      // Rotation is on server-side, so the response normally carries a new
      // refresh token. Without one, keep the stored refresh.
      await writeTokens(newAccess, newRefresh);
      return { status: "ok", access: newAccess };
    } catch (err) {
      const status = (err as AxiosError)?.response?.status;
      console.warn(
        "[auth] refresh failed:",
        status ?? (err as Error)?.message
      );
      if (status === 401 || status === 400 || isTokenRejected(err)) {
        return { status: "invalid" };
      }
      return { status: "unavailable" };
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

// Clears tokens then triggers the navigator swap (AppNavigator registers an
// onAuthFailure handler that flips the auth store). Skipped when the session
// already changed (signed out, or a new login) since the failure was seen.
async function bailToLogin(epoch: number): Promise<void> {
  if (epoch !== sessionEpoch) return;
  await tokenStorage.clear();
  onAuthFailure?.();
}

// Refresh now. Signs out only on "invalid".
export async function proactiveRefresh(): Promise<RefreshOutcome> {
  const epoch = sessionEpoch;
  const outcome = await refreshAccessToken();
  if (outcome.status === "invalid") await bailToLogin(epoch);
  return outcome;
}

// Seconds-since-epoch claim from a JWT payload, or null if unreadable.
function jwtClaim(token: string, claim: "iat" | "exp"): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bits = 0;
    let value = 0;
    let json = "";
    for (const c of b64) {
      const idx = chars.indexOf(c);
      if (idx < 0) continue;
      value = (value << 6) | idx;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        json += String.fromCharCode((value >> bits) & 0xff);
      }
    }
    const n = (JSON.parse(json) as Record<string, unknown>)[claim];
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

// True when the stored access token is missing, unreadable, older than
// ACCESS_MAX_AGE_MS or within 10 minutes of expiry.
async function accessIsStale(): Promise<boolean> {
  const access = await tokenStorage.getAccess();
  if (!access) return true;
  const now = Date.now();
  const iat = jwtClaim(access, "iat");
  const exp = jwtClaim(access, "exp");
  if (iat == null && exp == null) return true;
  if (iat != null && now - iat * 1000 > ACCESS_MAX_AGE_MS) return true;
  if (exp != null && exp * 1000 - now < 10 * 60 * 1000) return true;
  return false;
}

// Used when the app returns to the foreground: refresh only if the access
// token is about to lapse, so the first tap does not hit a 401.
export async function refreshIfStale(): Promise<RefreshOutcome | null> {
  if (!(await tokenStorage.getRefresh())) return null;
  if (!(await accessIsStale())) return null;
  return proactiveRefresh();
}

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;

    // Only a rejected token triggers refresh; everything else (including a
    // plain 403 permission denial) passes through untouched.
    if (!original || !isTokenRejected(error)) {
      return Promise.reject(error);
    }

    // The refresh / login calls themselves can't be refreshed; let the
    // error propagate to the caller.
    const url = original.url ?? "";
    if (
      url.includes("/api/users/token/refresh/") ||
      url.includes("/api/users/login/")
    ) {
      return Promise.reject(error);
    }

    const epoch = sessionEpoch;

    // The token was rejected again right after a successful refresh: the
    // server will not accept this session, so sign out.
    if (original._retried) {
      await bailToLogin(epoch);
      return Promise.reject(error);
    }

    original._retried = true;
    const outcome = await refreshAccessToken();
    if (outcome.status === "invalid") {
      await bailToLogin(epoch);
      return Promise.reject(error);
    }
    if (outcome.status === "unavailable") {
      // Could not reach the server to renew. Stay signed in; the screen
      // shows its normal error and the next request tries again.
      (error as AxiosError & SessionRenewUnavailableError).sessionRenewUnavailable =
        true;
      return Promise.reject(error);
    }

    // Retry the original request. The request interceptor attaches the
    // fresh access token from storage.
    return api.request(original);
  }
);

export { apiBaseUrl };
