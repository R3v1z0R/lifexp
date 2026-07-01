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

  login: (body: { identifier: string; password: string }) =>
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

  // ── Friends ──────────────────────────────────────────────────────
  friends: () => request<{ friends: Friend[] }>("/friends"),
  friendRequests: () => request<{ requests: FriendRequest[] }>("/friends/requests"),
  feed: () => request<{ feed: FeedItem[] }>("/friends/feed"),
  searchUsers: (q: string) =>
    request<{ users: SearchUser[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  sendFriendRequest: (addresseeId: string) =>
    request<{ id: string; status: string }>("/friends/request", {
      method: "POST",
      body: JSON.stringify({ addresseeId }),
    }),
  acceptFriendRequest: (id: string) =>
    request<{ id: string; status: string }>(`/friends/accept/${id}`, { method: "POST" }),

  // ── Goals ────────────────────────────────────────────────────────
  goals: () => request<{ goals: Goal[] }>("/goals"),
  createGoal: (body: {
    activitySlug: string;
    targetValue: number;
    visibility?: Visibility;
  }) => request<Goal>("/goals", { method: "POST", body: JSON.stringify(body) }),
  joinGoal: (id: string) =>
    request<{ goalId: string; joined: boolean }>(`/goals/${id}/join`, { method: "POST" }),

  // ── Events ───────────────────────────────────────────────────────
  events: () => request<{ events: EventItem[] }>("/events"),
  createEvent: (body: {
    title: string;
    activitySlug: string;
    startAt: string;
    endAt: string;
    entryCredits?: number;
    visibility?: Visibility;
    isPublic?: boolean;
  }) => request<EventItem>("/events", { method: "POST", body: JSON.stringify(body) }),
  joinEvent: (id: string) =>
    request<unknown>(`/events/${id}/join`, { method: "POST" }),
  finishEvent: (id: string) =>
    request<{ eventId: string; status: string; results: EventResult[] }>(
      `/events/${id}/finish`,
      { method: "POST" }
    ),

  // ── Billing ──────────────────────────────────────────────────────
  billingMe: () => request<BillingStatus>("/billing/me"),
  checkout: (body:
    | { kind: "subscription"; plan: "pro" | "team" }
    | { kind: "credits"; pack: string }) =>
    request<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // ── Admin ────────────────────────────────────────────────────────
  adminList: (path: string) =>
    request<{ items: Record<string, unknown>[] }>(`/admin/${path}`),
  adminCreate: (path: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/admin/${path}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminUpdate: (path: string, id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/admin/${path}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  adminDelete: (path: string, id: string) =>
    request<{ deleted: boolean }>(`/admin/${path}/${id}`, { method: "DELETE" }),

  // ── Integrations ─────────────────────────────────────────────────
  integrations: () => request<{ connections: Connection[] }>("/integrations"),
  connectUrl: (provider: string) =>
    request<{ url: string }>(`/integrations/${provider}/connect`),
  syncProvider: (provider: string) =>
    request<{ imported: number; pending: number }>(`/integrations/${provider}/sync`, {
      method: "POST",
    }),
  disconnect: (provider: string) =>
    request<{ disconnected: boolean }>(`/integrations/${provider}`, { method: "DELETE" }),

  // ── Imports ──────────────────────────────────────────────────────
  imports: (status = "pending") =>
    request<{ imports: ImportItem[] }>(`/imports?status=${status}`),
  acceptImport: (id: string, activitySlug?: string) =>
    request<unknown>(`/imports/${id}/accept`, {
      method: "POST",
      body: JSON.stringify(activitySlug ? { activitySlug } : {}),
    }),
  acceptAllImports: () =>
    request<{ accepted: number }>("/imports/accept", { method: "POST" }),
  dismissImport: (id: string) =>
    request<{ dismissed: boolean }>(`/imports/${id}/dismiss`, { method: "POST" }),
};

export type Visibility = "public" | "friends" | "private";

export interface Friend {
  id: string;
  username: string;
  hero_level: number;
  avatar_url: string | null;
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  username: string;
  hero_level: number;
  created_at: string;
}

export interface FeedItem {
  id: string;
  user_id: string;
  username: string;
  activity_slug: string;
  value: number;
  final_xp: number;
  logged_at: string;
}

export interface SearchUser {
  id: string;
  username: string;
  hero_level: number;
}

export interface Goal {
  id: string;
  creator_id: string;
  activity_slug: string;
  target_value: number;
  entry_credits: number;
  visibility: Visibility;
  status: string;
  created_at: string;
}

export interface EventItem {
  id: string;
  creator_id: string;
  title: string;
  activity_slug: string;
  start_at: string;
  end_at: string;
  entry_credits: number;
  visibility: Visibility;
  is_public: boolean;
  status: string;
  created_at: string;
}

export interface EventResult {
  user_id: string;
  rank: number;
  bonus_xp: number;
}

export interface BillingStatus {
  plan: "free" | "pro" | "team";
  plan_expires_at: string | null;
  credit_balance: number;
}

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

export interface Connection {
  provider: string;
  status: "active" | "needs_reauth";
  connected_at: string;
  last_synced_at: string | null;
}

export interface ImportItem {
  id: string;
  provider: string;
  external_id: string;
  occurred_at: string;
  provider_type: string;
  mapped_activity_slug: string | null;
  value: number | null;
  status: "pending" | "accepted" | "dismissed";
}

export { ApiError };
