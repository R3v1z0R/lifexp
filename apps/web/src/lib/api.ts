import type {
  ActivityDefinition,
  ActivityIntensityConfig,
  LevelUpEvent,
  User,
  XpBreakdown,
} from "@lifexp/types";

const API_URL = (import.meta.env.VITE_API_URL as string) || "http://localhost:3000";

const TOKEN_KEY = "lifexp.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

// ── Auth ────────────────────────────────────────────────────────────
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const api = {
  register: (body: { username: string; email: string; password: string }) =>
    request<AuthResult>("/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  me: () => request<{ user: User; sections: UserSection[] }>("/me"),

  activities: () => request<{ activities: ActivityDefinition[] }>("/activities"),

  intensity: (slug: string) =>
    request<{ configs: ActivityIntensityConfig[] }>(`/activities/${slug}/intensity`),

  logs: () => request<ActivityLog[]>("/logs"),

  createLog: (body: {
    activitySlug: string;
    value: number;
    intensityInputs?: Record<string, number>;
  }) => request<LogResponse>("/logs", { method: "POST", body: JSON.stringify(body) }),
};

export interface UserSection {
  user_id: string;
  section_slug: string;
  level: number;
  xp: number;
  status: string;
}

export interface ActivityLog {
  id: string;
  activity_slug: string;
  value: number;
  final_xp: number;
  intensity_multiplier: number;
  streak_multiplier: number;
  logged_at: string;
}

export interface LogResponse {
  xpBreakdown: XpBreakdown;
  activityLevelUp: LevelUpEvent | null;
  sectionLevelUp: LevelUpEvent | null;
  heroLevelUp: LevelUpEvent | null;
  streakUpdated?: unknown;
  personalBestsImproved?: unknown;
}

export { ApiError };
