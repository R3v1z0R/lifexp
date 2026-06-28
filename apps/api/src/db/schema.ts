import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// Enums
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const planEnum = pgEnum("plan", ["free", "pro", "team"]);
export const visibilityEnum = pgEnum("visibility", ["public", "friends", "private"]);
export const perkChoiceStatusEnum = pgEnum("perk_choice_status", ["pending", "chosen", "auto_resolved"]);
export const streakScopeEnum = pgEnum("streak_scope", ["activity", "section"]);
export const eventStatusEnum = pgEnum("event_status", ["upcoming", "ongoing", "completed"]);
export const platformEnum = pgEnum("device_platform", ["ios", "android"]);

// Users
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username").notNull().unique(),
    email: varchar("email").notNull().unique(),
    password_hash: varchar("password_hash").notNull(),
    avatar_url: varchar("avatar_url"),
    hero_level: integer("hero_level").default(1).notNull(),
    hero_xp: integer("hero_xp").default(0).notNull(),
    role: roleEnum("role").default("user").notNull(),
    plan: planEnum("plan").default("free").notNull(),
    plan_expires_at: timestamp("plan_expires_at"),
    credit_balance: integer("credit_balance").default(0).notNull(),
    stripe_customer_id: varchar("stripe_customer_id"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex().on(t.email),
    usernameIdx: uniqueIndex().on(t.username),
  })
);

export const user_settings = pgTable("user_settings", {
  user_id: uuid("user_id")
    .primaryKey()
    .references(() => users.id),
  profile_visibility: visibilityEnum("profile_visibility").default("friends").notNull(),
  default_log_visibility: visibilityEnum("default_log_visibility").default("friends").notNull(),
  notifications_enabled: boolean("notifications_enabled").default(true).notNull(),
  timezone: varchar("timezone").default("UTC").notNull(),
});

export const device_tokens = pgTable(
  "device_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    expo_push_token: varchar("expo_push_token").notNull().unique(),
    platform: platformEnum("platform").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
    last_seen_at: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => ({
    tokenIdx: uniqueIndex().on(t.expo_push_token),
  })
);

export const refresh_tokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    token_hash: varchar("token_hash").notNull(),
    expires_at: timestamp("expires_at").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index().on(t.user_id),
  })
);

// Admin Definitions
export const section_definitions = pgTable("section_definitions", {
  slug: varchar("slug").primaryKey(),
  name: varchar("name").notNull(),
  color_accent: varchar("color_accent"),
  icon_name: varchar("icon_name"),
  display_order: integer("display_order").default(0).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});

export const activity_definitions = pgTable(
  "activity_definitions",
  {
    slug: varchar("slug").primaryKey(),
    section_slug: varchar("section_slug")
      .notNull()
      .references(() => section_definitions.slug),
    name: varchar("name").notNull(),
    unit: varchar("unit").notNull(),
    input_type: varchar("input_type").notNull(), // numeric, select, multi
    effort_minutes_per_unit: integer("effort_minutes_per_unit").notNull(),
    min_value: integer("min_value").default(0).notNull(),
    max_value: integer("max_value").default(1000).notNull(),
    daily_xp_cap: integer("daily_xp_cap").default(500).notNull(),
    default_goal: integer("default_goal"),
    required_plan: planEnum("required_plan").default("free").notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    display_order: integer("display_order").default(0).notNull(),
  },
  (t) => ({
    sectionIdx: index().on(t.section_slug),
  })
);

export const activity_intensity_configs = pgTable(
  "activity_intensity_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activity_slug: varchar("activity_slug")
      .notNull()
      .references(() => activity_definitions.slug),
    input_key: varchar("input_key").notNull(),
    label: varchar("label").notNull(),
    input_type: varchar("input_type").notNull(), // numeric, select
    scoring_mode: varchar("scoring_mode").notNull(), // higher_is_better, lower_is_better
    score_min_value: integer("score_min_value").notNull(),
    score_max_value: integer("score_max_value").notNull(),
    multiplier_at_score_0: integer("multiplier_at_score_0").notNull(), // stored as integer * 100
    multiplier_at_score_50: integer("multiplier_at_score_50").notNull(),
    multiplier_at_score_100: integer("multiplier_at_score_100").notNull(),
    vs_personal_best: boolean("vs_personal_best").default(false).notNull(),
  },
  (t) => ({
    activityIdx: index().on(t.activity_slug),
  })
);

export const streak_bonus_tiers = pgTable("streak_bonus_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  days_required: integer("days_required").notNull(),
  bonus_percent: integer("bonus_percent").notNull(),
});

export const xp_multiplier_caps = pgTable("xp_multiplier_caps", {
  cap_key: varchar("cap_key").primaryKey(), // perk_stack, intensity, streak, total
  cap_value: integer("cap_value").notNull(), // stored as integer * 100
});

// Personal Bests
export const user_personal_bests = pgTable(
  "user_personal_bests",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    activity_slug: varchar("activity_slug")
      .notNull()
      .references(() => activity_definitions.slug),
    input_key: varchar("input_key").notNull(),
    best_value: integer("best_value").notNull(),
    achieved_at: timestamp("achieved_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.activity_slug, t.input_key] }),
    userActivityIdx: uniqueIndex().on(t.user_id, t.activity_slug),
  })
);

// User Progress
export const sections = pgTable(
  "sections",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    section_slug: varchar("section_slug")
      .notNull()
      .references(() => section_definitions.slug),
    level: integer("level").default(1).notNull(),
    xp: integer("xp").default(0).notNull(),
    status: varchar("status").default("active").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.section_slug] }),
  })
);

export const activities = pgTable(
  "activities",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    activity_slug: varchar("activity_slug")
      .notNull()
      .references(() => activity_definitions.slug),
    level: integer("level").default(1).notNull(),
    xp: integer("xp").default(0).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.activity_slug] }),
    userIdx: index().on(t.user_id),
  })
);

export const activity_logs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    activity_slug: varchar("activity_slug")
      .notNull()
      .references(() => activity_definitions.slug),
    value: integer("value").notNull(),
    raw_xp: integer("raw_xp").notNull(),
    intensity_score: integer("intensity_score"), // stored as integer * 100 if present
    intensity_multiplier: integer("intensity_multiplier").notNull(), // stored as integer * 100
    perk_multiplier: integer("perk_multiplier").notNull(),
    streak_multiplier: integer("streak_multiplier").notNull(),
    final_xp: integer("final_xp").notNull(),
    applied_perk_slugs: jsonb("applied_perk_slugs").default([]).notNull(),
    intensity_inputs: jsonb("intensity_inputs"),
    goal_id: uuid("goal_id"),
    event_participant_id: uuid("event_participant_id"),
    logged_at: timestamp("logged_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index().on(t.user_id),
    activityIdx: index().on(t.activity_slug),
    loggedAtIdx: index().on(t.logged_at),
  })
);

// Streaks
export const streaks = pgTable(
  "streaks",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    scope: streakScopeEnum("scope").notNull(), // activity or section
    scope_slug: varchar("scope_slug").notNull(),
    current_streak: integer("current_streak").default(0).notNull(),
    longest_streak: integer("longest_streak").default(0).notNull(),
    last_log_date: varchar("last_log_date"), // ISO date
    freeze_tokens: integer("freeze_tokens").default(0).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.scope, t.scope_slug] }),
  })
);

// Perks
export const perks = pgTable("perks", {
  slug: varchar("slug").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  trigger_type: varchar("trigger_type").notNull(), // activity_level_up, section_level_up, hero_level_up
  trigger_slug: varchar("trigger_slug"), // activity or section slug
  effect_type: varchar("effect_type").notNull(), // xp_multiplier, activity_unlock, cosmetic
  effect_value: integer("effect_value").notNull(), // for xp_multiplier: stored as integer * 100
  required_plan: planEnum("required_plan").default("free").notNull(),
});

export const user_perks = pgTable(
  "user_perks",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    perk_slug: varchar("perk_slug")
      .notNull()
      .references(() => perks.slug),
    acquired_at: timestamp("acquired_at").defaultNow().notNull(),
    expires_at: timestamp("expires_at"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.perk_slug] }),
    userIdx: index().on(t.user_id),
  })
);

export const perk_choices = pgTable(
  "perk_choices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    trigger_type: varchar("trigger_type").notNull(),
    trigger_slug: varchar("trigger_slug"),
    level: integer("level").notNull(),
    option_a_perk_slug: varchar("option_a_perk_slug")
      .notNull()
      .references(() => perks.slug),
    option_b_perk_slug: varchar("option_b_perk_slug")
      .notNull()
      .references(() => perks.slug),
    status: perkChoiceStatusEnum("status").default("pending").notNull(),
    chosen_perk_slug: varchar("chosen_perk_slug"),
    expires_at: timestamp("expires_at").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index().on(t.user_id),
    expiresIdx: index().on(t.expires_at),
  })
);

// Social Features
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requester_id: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    addressee_id: uuid("addressee_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status").notNull(), // pending, accepted, blocked
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    requesterIdx: index().on(t.requester_id),
    addresseeIdx: index().on(t.addressee_id),
  })
);

export const shared_goals = pgTable(
  "shared_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creator_id: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    activity_slug: varchar("activity_slug")
      .notNull()
      .references(() => activity_definitions.slug),
    target_value: integer("target_value").notNull(),
    entry_credits: integer("entry_credits").default(0).notNull(),
    visibility: visibilityEnum("visibility").default("friends").notNull(),
    status: varchar("status").default("active").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    creatorIdx: index().on(t.creator_id),
    statusIdx: index().on(t.status),
  })
);

export const shared_goal_members = pgTable(
  "shared_goal_members",
  {
    goal_id: uuid("goal_id")
      .notNull()
      .references(() => shared_goals.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    contribution_value: integer("contribution_value").default(0).notNull(),
    joined_at: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.goal_id, t.user_id] }),
  })
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creator_id: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    title: varchar("title").notNull(),
    activity_slug: varchar("activity_slug")
      .notNull()
      .references(() => activity_definitions.slug),
    start_at: timestamp("start_at").notNull(),
    end_at: timestamp("end_at").notNull(),
    entry_credits: integer("entry_credits").default(0).notNull(),
    visibility: visibilityEnum("visibility").default("friends").notNull(),
    is_public: boolean("is_public").default(false).notNull(),
    status: eventStatusEnum("status").default("upcoming").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    creatorIdx: index().on(t.creator_id),
    statusIdx: index().on(t.status),
  })
);

export const event_participants = pgTable(
  "event_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    event_id: uuid("event_id")
      .notNull()
      .references(() => events.id),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    contribution_value: integer("contribution_value").default(0).notNull(),
    rank: integer("rank"),
    bonus_xp: integer("bonus_xp").default(0).notNull(),
    joined_at: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => ({
    eventIdx: index().on(t.event_id),
    userIdx: index().on(t.user_id),
  })
);

// Monetization
export const credit_transactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amount: integer("amount").notNull(),
    reason: varchar("reason").notNull(),
    ref_id: varchar("ref_id"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index().on(t.user_id),
  })
);

export const stripe_webhooks_log = pgTable("stripe_webhooks_log", {
  stripe_event_id: varchar("stripe_event_id").primaryKey(),
  payload: jsonb("payload").notNull(),
  processed_at: timestamp("processed_at").defaultNow().notNull(),
});

// Notifications
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type").notNull(),
    payload: jsonb("payload"),
    read_at: timestamp("read_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index().on(t.user_id),
    createdIdx: index().on(t.created_at),
  })
);

// Achievements (deferred for now)
export const achievements = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug").notNull().unique(),
  name: varchar("name").notNull(),
  description: text("description"),
  icon_url: varchar("icon_url"),
});

export const user_achievements = pgTable(
  "user_achievements",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    achievement_id: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id),
    unlocked_at: timestamp("unlocked_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.achievement_id] }),
  })
);

// Cosmetics (deferred for now)
export const cosmetics = pgTable("cosmetics", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug").notNull().unique(),
  name: varchar("name").notNull(),
  type: varchar("type").notNull(), // avatar_border, title, etc
  price_credits: integer("price_credits"),
});

export const user_cosmetics = pgTable(
  "user_cosmetics",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    cosmetic_id: uuid("cosmetic_id")
      .notNull()
      .references(() => cosmetics.id),
    acquired_at: timestamp("acquired_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.cosmetic_id] }),
  })
);
