import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "auth.access";
const REFRESH_KEY = "auth.refresh";

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
  async set(access: string, refresh: string) {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  async setAccess(access: string) {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
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

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const refresh = await tokenStorage.getRefresh();
      if (!refresh) return null;
      const resp = await axios.post(`${apiBaseUrl}/api/users/token/refresh/`, { refresh });
      const newAccess: string | undefined = resp.data?.access;
      if (!newAccess) return null;
      await tokenStorage.setAccess(newAccess);
      return newAccess;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried) {
      // Don't try to refresh the refresh-token call itself.
      const url = original.url ?? "";
      if (url.includes("/api/users/token/refresh/") || url.includes("/api/users/login/")) {
        return Promise.reject(error);
      }
      original._retried = true;
      const newAccess = await refreshAccessToken();
      if (newAccess) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newAccess}` };
        return api.request(original);
      }
      await tokenStorage.clear();
      onAuthFailure?.();
    }
    return Promise.reject(error);
  }
);

export { apiBaseUrl };
