import { db } from "./index";
import * as schema from "./schema";

async function seed() {
  console.log("🌱 Starting database seed...");

  try {
    // Clear existing data (in order of foreign key dependencies)
    await db.delete(schema.perk_choices);
    await db.delete(schema.user_perks);
    await db.delete(schema.perks);
    await db.delete(schema.activity_logs);
    await db.delete(schema.streaks);
    await db.delete(schema.activities);
    await db.delete(schema.sections);
    await db.delete(schema.user_personal_bests);
    await db.delete(schema.event_participants);
    await db.delete(schema.events);
    await db.delete(schema.shared_goal_members);
    await db.delete(schema.shared_goals);
    await db.delete(schema.friendships);
    await db.delete(schema.notifications);
    await db.delete(schema.credit_transactions);
    await db.delete(schema.stripe_webhooks_log);
    await db.delete(schema.user_achievements);
    await db.delete(schema.achievements);
    await db.delete(schema.user_cosmetics);
    await db.delete(schema.cosmetics);
    await db.delete(schema.activity_intensity_configs);
    await db.delete(schema.activity_definitions);
    await db.delete(schema.section_definitions);
    await db.delete(schema.xp_multiplier_caps);
    await db.delete(schema.streak_bonus_tiers);
    await db.delete(schema.user_settings);
    await db.delete(schema.refresh_tokens);
    await db.delete(schema.users);

    console.log("✓ Cleared existing data");

    // Seed XP Multiplier Caps
    await db.insert(schema.xp_multiplier_caps).values([
      { cap_key: "perk_stack", cap_value: 200 }, // 2.0 * 100
      { cap_key: "intensity", cap_value: 150 }, // 1.5 * 100
      { cap_key: "streak", cap_value: 125 }, // 1.25 * 100
      { cap_key: "total", cap_value: 300 }, // 3.0 * 100
    ]);

    console.log("✓ Seeded XP multiplier caps");

    // Seed Streak Bonus Tiers
    await db.insert(schema.streak_bonus_tiers).values([
      { days_required: 3, bonus_percent: 2 },
      { days_required: 7, bonus_percent: 5 },
      { days_required: 30, bonus_percent: 10 },
      { days_required: 90, bonus_percent: 15 },
      { days_required: 365, bonus_percent: 25 },
    ]);

    console.log("✓ Seeded streak bonus tiers");

    // Seed Section Definitions
    await db.insert(schema.section_definitions).values([
      {
        slug: "fitness",
        name: "Fitness",
        color_accent: "#FF6B6B",
        icon_name: "activity",
        display_order: 1,
        is_active: true,
      },
      {
        slug: "wellness",
        name: "Wellness",
        color_accent: "#4ECDC4",
        icon_name: "heart",
        display_order: 2,
        is_active: true,
      },
      {
        slug: "learning",
        name: "Learning",
        color_accent: "#45B7D1",
        icon_name: "book",
        display_order: 3,
        is_active: true,
      },
      {
        slug: "productivity",
        name: "Productivity",
        color_accent: "#FFA502",
        icon_name: "zap",
        display_order: 4,
        is_active: true,
      },
    ]);

    console.log("✓ Seeded section definitions");

    // Seed Activity Definitions
    await db.insert(schema.activity_definitions).values([
      {
        slug: "running",
        section_slug: "fitness",
        name: "Running",
        unit: "km",
        input_type: "numeric",
        effort_minutes_per_unit: 10,
        min_value: 0,
        max_value: 100,
        daily_xp_cap: 500,
        default_goal: 5,
        required_plan: "free",
        is_active: true,
        display_order: 1,
      },
      {
        slug: "cycling",
        section_slug: "fitness",
        name: "Cycling",
        unit: "km",
        input_type: "numeric",
        effort_minutes_per_unit: 5,
        min_value: 0,
        max_value: 200,
        daily_xp_cap: 500,
        default_goal: 10,
        required_plan: "free",
        is_active: true,
        display_order: 2,
      },
      {
        slug: "swimming",
        section_slug: "fitness",
        name: "Swimming",
        unit: "meters",
        input_type: "numeric",
        effort_minutes_per_unit: 1,
        min_value: 0,
        max_value: 5000,
        daily_xp_cap: 500,
        default_goal: 1000,
        required_plan: "free",
        is_active: true,
        display_order: 3,
      },
      {
        slug: "workout",
        section_slug: "fitness",
        name: "Workout",
        unit: "minutes",
        input_type: "numeric",
        effort_minutes_per_unit: 1,
        min_value: 0,
        max_value: 300,
        daily_xp_cap: 500,
        default_goal: 30,
        required_plan: "free",
        is_active: true,
        display_order: 4,
      },
      {
        slug: "walking",
        section_slug: "fitness",
        name: "Walking",
        unit: "km",
        input_type: "numeric",
        effort_minutes_per_unit: 12,
        min_value: 0,
        max_value: 50,
        daily_xp_cap: 500,
        default_goal: 10,
        required_plan: "free",
        is_active: true,
        display_order: 5,
      },
      {
        slug: "meditation",
        section_slug: "wellness",
        name: "Meditation",
        unit: "minutes",
        input_type: "numeric",
        effort_minutes_per_unit: 1,
        min_value: 0,
        max_value: 120,
        daily_xp_cap: 300,
        default_goal: 10,
        required_plan: "free",
        is_active: true,
        display_order: 1,
      },
      {
        slug: "sleep",
        section_slug: "wellness",
        name: "Sleep",
        unit: "hours",
        input_type: "numeric",
        effort_minutes_per_unit: 60,
        min_value: 0,
        max_value: 12,
        daily_xp_cap: 300,
        default_goal: 8,
        required_plan: "free",
        is_active: true,
        display_order: 2,
      },
      {
        slug: "reading",
        section_slug: "learning",
        name: "Reading",
        unit: "pages",
        input_type: "numeric",
        effort_minutes_per_unit: 1,
        min_value: 0,
        max_value: 500,
        daily_xp_cap: 400,
        default_goal: 20,
        required_plan: "free",
        is_active: true,
        display_order: 1,
      },
      {
        slug: "focus_session",
        section_slug: "productivity",
        name: "Focus Session",
        unit: "minutes",
        input_type: "numeric",
        effort_minutes_per_unit: 1,
        min_value: 0,
        max_value: 300,
        daily_xp_cap: 500,
        default_goal: 90,
        required_plan: "free",
        is_active: true,
        display_order: 1,
      },
      {
        slug: "deep_work",
        section_slug: "productivity",
        name: "Deep Work",
        unit: "hours",
        input_type: "numeric",
        effort_minutes_per_unit: 60,
        min_value: 0,
        max_value: 8,
        daily_xp_cap: 500,
        default_goal: 3,
        required_plan: "free",
        is_active: true,
        display_order: 2,
      },
    ]);

    console.log("✓ Seeded activity definitions");

    // Seed Activity Intensity Configs (matching spec)
    const intensityConfigs = [
      // running
      {
        activity_slug: "running",
        input_key: "pace_min_per_km",
        label: "Pace (min/km)",
        input_type: "numeric",
        scoring_mode: "lower_is_better",
        score_min_value: 8,
        score_max_value: 350,
        multiplier_at_score_0: 80,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 150,
        vs_personal_best: true,
      },
      // cycling
      {
        activity_slug: "cycling",
        input_key: "avg_speed_kmh",
        label: "Avg Speed (km/h)",
        input_type: "numeric",
        scoring_mode: "higher_is_better",
        score_min_value: 10,
        score_max_value: 40,
        multiplier_at_score_0: 80,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 150,
        vs_personal_best: true,
      },
      // swimming
      {
        activity_slug: "swimming",
        input_key: "pace_per_100m_sec",
        label: "Pace (sec/100m)",
        input_type: "numeric",
        scoring_mode: "lower_is_better",
        score_min_value: 180,
        score_max_value: 60,
        multiplier_at_score_0: 80,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 150,
        vs_personal_best: true,
      },
      // focus_session
      {
        activity_slug: "focus_session",
        input_key: "interruptions",
        label: "Interruptions",
        input_type: "numeric",
        scoring_mode: "lower_is_better",
        score_min_value: 5,
        score_max_value: 0,
        multiplier_at_score_0: 80,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 130,
        vs_personal_best: false,
      },
      // deep_work
      {
        activity_slug: "deep_work",
        input_key: "interruptions",
        label: "Interruptions",
        input_type: "numeric",
        scoring_mode: "lower_is_better",
        score_min_value: 5,
        score_max_value: 0,
        multiplier_at_score_0: 80,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 130,
        vs_personal_best: false,
      },
      // reading
      {
        activity_slug: "reading",
        input_key: "quality_rating",
        label: "Quality (1-5)",
        input_type: "numeric",
        scoring_mode: "higher_is_better",
        score_min_value: 1,
        score_max_value: 5,
        multiplier_at_score_0: 100,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 140,
        vs_personal_best: false,
      },
      // meditation
      {
        activity_slug: "meditation",
        input_key: "quality_rating",
        label: "Quality (1-5)",
        input_type: "numeric",
        scoring_mode: "higher_is_better",
        score_min_value: 1,
        score_max_value: 5,
        multiplier_at_score_0: 90,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 130,
        vs_personal_best: false,
      },
      // workout
      {
        activity_slug: "workout",
        input_key: "rpe",
        label: "RPE (1-10)",
        input_type: "numeric",
        scoring_mode: "higher_is_better",
        score_min_value: 1,
        score_max_value: 10,
        multiplier_at_score_0: 80,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 140,
        vs_personal_best: false,
      },
      // walking
      {
        activity_slug: "walking",
        input_key: "pace_min_per_km",
        label: "Pace (min/km)",
        input_type: "numeric",
        scoring_mode: "lower_is_better",
        score_min_value: 20,
        score_max_value: 8,
        multiplier_at_score_0: 80,
        multiplier_at_score_50: 100,
        multiplier_at_score_100: 130,
        vs_personal_best: true,
      },
    ];

    await db.insert(schema.activity_intensity_configs).values(intensityConfigs);

    console.log("✓ Seeded activity intensity configs");

    // Seed Perks
    const perks: (typeof schema.perks.$inferInsert)[] = [
      {
        slug: "swift_legs",
        name: "Swift Legs",
        description: "+25% XP on running activities",
        trigger_type: "activity_level_up",
        trigger_slug: "running",
        effect_type: "xp_multiplier",
        effect_value: 125,
        required_plan: "free",
      },
      {
        slug: "cycle_master",
        name: "Cycle Master",
        description: "+25% XP on cycling activities",
        trigger_type: "activity_level_up",
        trigger_slug: "cycling",
        effect_type: "xp_multiplier",
        effect_value: 125,
        required_plan: "free",
      },
      {
        slug: "meditation_master",
        name: "Meditation Master",
        description: "+20% XP on wellness activities",
        trigger_type: "section_level_up",
        trigger_slug: "wellness",
        effect_type: "xp_multiplier",
        effect_value: 120,
        required_plan: "free",
      },
      {
        slug: "focus_expert",
        name: "Focus Expert",
        description: "+30% XP on productivity activities",
        trigger_type: "section_level_up",
        trigger_slug: "productivity",
        effect_type: "xp_multiplier",
        effect_value: 130,
        required_plan: "pro",
      },
      {
        slug: "legendary_athlete",
        name: "Legendary Athlete",
        description: "+25% XP on all hero level-ups",
        trigger_type: "hero_level_up",
        effect_type: "xp_multiplier",
        effect_value: 125,
        required_plan: "team",
      },
    ];

    await db.insert(schema.perks).values(perks);

    console.log("✓ Seeded perks");

    console.log("✅ Database seeded successfully!");
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
}

seed();
