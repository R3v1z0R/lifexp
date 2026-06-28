import * as SecureStore from "expo-secure-store";
import type {
  ActivityDefinition,
  ActivityIntensityConfig,
  LevelUpEvent,
  User,
  XpBreakdown,
} from "@lifexp/types";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
const ACCESS_KEY = "lifexp.token";
const REFRESH_KEY = "lifexp.refresh";

export const tokenStore = {
  getAccess: () => SecureStore.getItemAsync(ACCESS_KEY),
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  async setTokens(access: string, refresh: string) {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Module-level in-flight refresh so concurrent 401s trigger exactly one refresh.
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshToken = await tokenStore.getRefresh();
        if (!refreshToken) return false;
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return false;
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!data?.accessToken) return false;
        // The API's /auth/refresh returns ONLY a new access token; the refresh
        // token is non-rotating, so we keep the existing one in storage.
        await tokenStore.setTokens(data.accessToken, refreshToken);
        return true;
      } catch {
        // Network/parse failure during refresh is treated as a failed refresh:
        // request() will clear tokens and surface ApiError(401), not a raw throw.
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function rawFetch(path: string, options: RequestInit, access: string | null): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let access = await tokenStore.getAccess();
  let res = await rawFetch(path, options, access);

  if (res.status === 401 && !path.endsWith("/auth/refresh")) {
    const ok = await doRefresh();
    if (!ok) {
      await tokenStore.clear();
      throw new ApiError(401, "Session expired");
    }
    access = await tokenStore.getAccess();
    res = await rawFetch(path, options, access);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface LogResponse {
  xpBreakdown: XpBreakdown;
  activityLevelUp: LevelUpEvent | null;
  sectionLevelUp: LevelUpEvent | null;
  heroLevelUp: LevelUpEvent | null;
}

// A row from GET /logs, as consumed by the Home recent-quests list.
export interface RecentLog {
  id: string;
  activity_slug: string;
  value: number;
  final_xp: number;
  logged_at: string;
}

export const api = {
  login: (body: { identifier: string; password: string }) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body: { username: string; email: string; password: string }) =>
    request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<{ user: User; sections: unknown[] }>("/me"),
  activities: () => request<{ activities: ActivityDefinition[] }>("/activities"),
  intensity: (slug: string) =>
    request<{ configs: ActivityIntensityConfig[] }>(`/activities/${slug}/intensity`),
  logs: () => request<RecentLog[]>("/logs"),
  createLog: (body: {
    activitySlug: string;
    value: number;
    intensityInputs?: Record<string, number>;
  }) => request<LogResponse>("/logs", { method: "POST", body: JSON.stringify(body) }),
  billingMe: () => request<{ plan: string; credit_balance: number }>("/billing/me"),
  registerDevice: (body: { expoPushToken: string; platform: "ios" | "android" }) =>
    request<{ ok: boolean }>("/devices", { method: "POST", body: JSON.stringify(body) }),
  unregisterDevice: (expoPushToken: string) =>
    request<{ ok: boolean }>("/devices", {
      method: "DELETE",
      body: JSON.stringify({ expoPushToken }),
    }),
};
