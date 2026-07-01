// User and Auth
export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url?: string | null;
  hero_level: number;
  hero_xp: number;
  role: "user" | "admin";
  plan: "free" | "pro" | "team";
  plan_expires_at?: string | Date | null;
  credit_balance: number;
  stripe_customer_id?: string | null;
  created_at: string | Date;
}

export interface UserSettings {
  user_id: string;
  profile_visibility: "public" | "friends" | "private";
  default_log_visibility: "public" | "friends" | "private";
  notifications_enabled: boolean;
  timezone: string;
}

// Activity Definitions
export interface SectionDefinition {
  slug: string;
  name: string;
  color_accent: string;
  icon_name: string;
  display_order: number;
  is_active: boolean;
}

export interface ActivityDefinition {
  slug: string;
  section_slug: string;
  name: string;
  unit: string;
  input_type: "numeric" | "select" | "multi";
  effort_minutes_per_unit: number;
  min_value: number;
  max_value: number;
  daily_xp_cap: number;
  default_goal?: number;
  required_plan: "free" | "pro" | "team";
  is_active: boolean;
  display_order: number;
}

// Intensity Config
export interface ActivityIntensityConfig {
  id: string;
  activity_slug: string;
  input_key: string;
  label: string;
  input_type: string; // "numeric" | "select"
  scoring_mode: string; // "higher_is_better" | "lower_is_better"
  score_min_value: number;
  score_max_value: number;
  multiplier_at_score_0: number;
  multiplier_at_score_50: number;
  multiplier_at_score_100: number;
  vs_personal_best: boolean;
}

// Personal Bests
export interface PersonalBest {
  user_id: string;
  activity_slug: string;
  input_key: string;
  best_value: number;
  achieved_at: string | Date;
}

// XP Multiplier Caps & Streak Bonuses
export interface StreakBonusTier {
  id: string;
  days_required: number;
  bonus_percent: number;
}

export interface XpMultiplierCap {
  cap_key: string;
  cap_value: number;
}

// Perks
export interface Perk {
  slug: string;
  name: string;
  description?: string | null;
  trigger_type: "activity_level_up" | "section_level_up" | "hero_level_up";
  trigger_slug?: string | null;
  effect_type: "xp_multiplier" | "activity_unlock" | "cosmetic";
  effect_value: number;
  required_plan: "free" | "pro" | "team";
}

export interface UserPerk {
  user_id: string;
  perk_slug: string;
  acquired_at: string;
  expires_at?: string;
}

export interface PerkChoice {
  id: string;
  user_id: string;
  trigger_type: string;
  trigger_slug?: string;
  level: number;
  option_a_perk_slug: string;
  option_b_perk_slug: string;
  status: "pending" | "chosen" | "auto_resolved";
  chosen_perk_slug?: string;
  expires_at: string;
}

// XP Breakdown
export interface XpBreakdown {
  raw_xp: number;
  intensity_score: number | null;
  intensity_multiplier: number;
  perk_multiplier: number;
  streak_multiplier: number;
  final_xp: number;
  applied_perk_slugs: string[];
}

// Level-up Events
export interface LevelUpEvent {
  scope: "activity" | "section" | "hero";
  scope_slug?: string;
  previous_level: number;
  new_level: number;
  remaining_xp: number;
  perk_choices?: PerkChoice[] | null;
}

// Streak Result
export interface StreakResult {
  scope: "activity" | "section";
  scope_slug: string;
  current_streak: number;
  longest_streak: number;
  updated: boolean;
}

// Log Pipeline Response
export interface LogResponse {
  xpBreakdown: XpBreakdown;
  activityLevelUp?: LevelUpEvent | null;
  sectionLevelUp?: LevelUpEvent | null;
  heroLevelUp?: LevelUpEvent | null;
  pendingPerkChoices: PerkChoice[];
  streakUpdated: StreakResult[];
  personalBestsImproved: Array<{
    inputKey: string;
    label: string;
    oldValue: number;
    newValue: number;
  }>;
}

// Activity Log
export interface ActivityLog {
  id: string;
  user_id: string;
  activity_slug: string;
  value: number;
  raw_xp: number;
  intensity_score: number | null;
  intensity_multiplier: number;
  perk_multiplier: number;
  streak_multiplier: number;
  final_xp: number;
  applied_perk_slugs: string[];
  intensity_inputs?: Record<string, number>;
  goal_id?: string;
  event_participant_id?: string;
  logged_at: string;
}

// Social Features
export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
}

export interface SharedGoal {
  id: string;
  creator_id: string;
  activity_slug: string;
  target_value: number;
  entry_credits: number;
  visibility: "public" | "friends" | "private";
  status: "active" | "completed" | "cancelled";
  created_at: string;
}

export interface Event {
  id: string;
  creator_id: string;
  title: string;
  activity_slug: string;
  start_at: string;
  end_at: string;
  entry_credits: number;
  visibility: "public" | "friends" | "private";
  is_public: boolean;
  status: "upcoming" | "ongoing" | "completed";
  created_at: string;
}

// Features for entitlements
export type Feature =
  | "PRIVATE_EVENTS"
  | "GROUP_EVENTS"
  | "MULTIPLE_SHARED_GOALS"
  | "ADVANCED_ANALYTICS"
  | "TEAM_FEATURES"
  | "CLOUD_IMPORT";

export const FEATURE_GATES: Record<Feature, ("free" | "pro" | "team")[]> = {
  PRIVATE_EVENTS: ["pro", "team"],
  GROUP_EVENTS: ["pro", "team"],
  MULTIPLE_SHARED_GOALS: ["pro", "team"],
  ADVANCED_ANALYTICS: ["pro", "team"],
  TEAM_FEATURES: ["team"],
  CLOUD_IMPORT: ["pro", "team"],
};

// Auth
export interface AuthPayload {
  userId: string;
  email: string;
  role: "user" | "admin";
  iat: number;
  exp: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  iat: number;
  exp: number;
}
