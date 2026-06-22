import { db } from "../db";
import * as schema from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  computeFinalXP,
  checkLevelUp,
  getPerkChoices,
  updatePersonalBests,
} from "@lifexp/xp-engine";
import type {
  LogResponse,
  ActivityDefinition,
  ActivityIntensityConfig,
  PersonalBest,
  Perk,
  StreakBonusTier,
  XpMultiplierCap,
  LevelUpEvent,
} from "@lifexp/types";

interface LogActivityInput {
  userId: string;
  activitySlug: string;
  value: number;
  intensityInputs?: Record<string, number>;
  goalId?: string;
  eventParticipantId?: string;
}

export async function logActivity(input: LogActivityInput): Promise<LogResponse> {
  return db.transaction(async (tx) => {
    const {
      userId,
      activitySlug,
      value,
      intensityInputs = {},
      goalId,
      eventParticipantId,
    } = input;

    // Step 1: Load activity definition
    const activityDef = await tx.query.activity_definitions.findFirst({
      where: eq(schema.activity_definitions.slug, activitySlug),
    });

    if (!activityDef) {
      throw new Error(`Activity ${activitySlug} not found`);
    }

    // Step 2: Validate value
    if (value < activityDef.min_value || value > activityDef.max_value) {
      throw new Error(
        `Value ${value} outside allowed range [${activityDef.min_value}, ${activityDef.max_value}]`
      );
    }

    // Step 3: Load intensity configs
    const intensityConfigs = (await tx.query.activity_intensity_configs.findMany({
      where: eq(schema.activity_intensity_configs.activity_slug, activitySlug),
    })) as ActivityIntensityConfig[];

    // Step 4: Load personal bests
    const personalBests = await tx.query.user_personal_bests.findMany({
      where: and(
        eq(schema.user_personal_bests.user_id, userId),
        eq(schema.user_personal_bests.activity_slug, activitySlug)
      ),
    });

    // Step 5: Load user's active perks
    const userPerks = await tx.query.user_perks.findMany({
      where: eq(schema.user_perks.user_id, userId),
    });

    const perksData =
      userPerks.length > 0
        ? ((await tx.query.perks.findMany({
            where: eq(schema.perks.slug, sql`ANY(${userPerks.map((p) => p.perk_slug)})`),
          })) as Perk[])
        : [];

    // Step 6: Load current streak
    const streak = await tx.query.streaks.findFirst({
      where: and(
        eq(schema.streaks.user_id, userId),
        eq(schema.streaks.scope, "activity"),
        eq(schema.streaks.scope_slug, activitySlug)
      ),
    });

    const currentStreak = streak?.current_streak || 0;

    // Step 7: Load streak bonus tiers and XP multiplier caps
    const streakBonusTiers = await tx.query.streak_bonus_tiers.findMany();
    const xpCaps = await tx.query.xp_multiplier_caps.findMany();

    const intensityCap = xpCaps.find((c) => c.cap_key === "intensity") || {
      cap_key: "intensity",
      cap_value: 150,
    };
    const perkStackCap = xpCaps.find((c) => c.cap_key === "perk_stack") || {
      cap_key: "perk_stack",
      cap_value: 200,
    };
    const streakCap = xpCaps.find((c) => c.cap_key === "streak") || {
      cap_key: "streak",
      cap_value: 125,
    };
    const totalCap = xpCaps.find((c) => c.cap_key === "total") || {
      cap_key: "total",
      cap_value: 300,
    };

    // Step 8: Pre-transaction SELECT - sum today's XP for this activity
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const todayXpResult = await tx
      .select({ total: sql<number>`COALESCE(SUM(${schema.activity_logs.final_xp}), 0)` })
      .from(schema.activity_logs)
      .where(
        and(
          eq(schema.activity_logs.user_id, userId),
          eq(schema.activity_logs.activity_slug, activitySlug),
          sql`${schema.activity_logs.logged_at}::date = ${todayIso}::date`
        )
      );

    const alreadyEarnedToday = todayXpResult[0]?.total || 0;

    // Step 9: Call computeFinalXP
    const xpBreakdown = computeFinalXP({
      baseXP: value * activityDef.effort_minutes_per_unit,
      intensityScore: intensityConfigs.length > 0 ? null : null, // Will be computed
      intensityConfigs,
      intensityMultiplierCap: intensityCap,
      perks: perksData,
      activitySlug,
      sectionSlug: activityDef.section_slug,
      perkStackCap,
      currentStreak,
      streakBonusTiers,
      streakCap,
      alreadyEarnedToday,
      dailyXpCap: activityDef.daily_xp_cap,
      totalXpCap: totalCap,
    });

    // Step 10: Update personal bests
    const improvedBests = updatePersonalBests(intensityInputs, intensityConfigs, personalBests);

    for (const best of improvedBests) {
      await tx
        .insert(schema.user_personal_bests)
        .values({
          user_id: userId,
          activity_slug: activitySlug,
          input_key: best.input_key,
          best_value: best.best_value,
          achieved_at: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            schema.user_personal_bests.user_id,
            schema.user_personal_bests.activity_slug,
            schema.user_personal_bests.input_key,
          ],
          set: {
            best_value: best.best_value,
            achieved_at: new Date(),
          },
        });
    }

    // Step 11: Insert activity log
    const [log] = await tx
      .insert(schema.activity_logs)
      .values({
        user_id: userId,
        activity_slug: activitySlug,
        value,
        raw_xp: xpBreakdown.raw_xp,
        intensity_score: xpBreakdown.intensity_score
          ? Math.round(xpBreakdown.intensity_score * 100)
          : null,
        intensity_multiplier: Math.round(xpBreakdown.intensity_multiplier * 100),
        perk_multiplier: Math.round(xpBreakdown.perk_multiplier * 100),
        streak_multiplier: Math.round(xpBreakdown.streak_multiplier * 100),
        final_xp: xpBreakdown.final_xp,
        applied_perk_slugs: xpBreakdown.applied_perk_slugs,
        intensity_inputs: Object.keys(intensityInputs).length > 0 ? intensityInputs : null,
        goal_id: goalId,
        event_participant_id: eventParticipantId,
      })
      .returning();

    // Step 12-14: Update activity/section/hero XP and check for level-ups
    let activityLevelUp: LevelUpEvent | null = null;
    let sectionLevelUp: LevelUpEvent | null = null;
    let heroLevelUp: LevelUpEvent | null = null;
    let pendingPerkChoices: any[] = [];

    // Activity level-up
    const [currentActivity] = await tx
      .select()
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.user_id, userId),
          eq(schema.activities.activity_slug, activitySlug)
        )
      );

    if (currentActivity) {
      const newXp = currentActivity.xp + xpBreakdown.final_xp;
      const levelUpResult = checkLevelUp(newXp, currentActivity.level);

      await tx
        .update(schema.activities)
        .set({ xp: levelUpResult.remainingXP, level: levelUpResult.newLevel })
        .where(
          and(
            eq(schema.activities.user_id, userId),
            eq(schema.activities.activity_slug, activitySlug)
          )
        );

      if (levelUpResult.leveled) {
        activityLevelUp = {
          scope: "activity",
          scope_slug: activitySlug,
          previous_level: currentActivity.level,
          new_level: levelUpResult.newLevel,
          remaining_xp: levelUpResult.remainingXP,
        };

        // Check for perk choices
        const choices = getPerkChoices(
          "activity_level_up",
          activitySlug,
          levelUpResult.newLevel,
          perksData
        );

        if (choices) {
          const [choice] = await tx
            .insert(schema.perk_choices)
            .values({
              user_id: userId,
              trigger_type: "activity_level_up",
              trigger_slug: activitySlug,
              level: levelUpResult.newLevel,
              option_a_perk_slug: choices.optionA.slug,
              option_b_perk_slug: choices.optionB.slug,
              status: "pending",
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            })
            .returning();

          pendingPerkChoices.push(choice);

          // Insert notification
          await tx.insert(schema.notifications).values({
            user_id: userId,
            type: "perk_choice_pending",
            payload: {
              choice_id: choice.id,
              level: levelUpResult.newLevel,
            },
          });
        }
      }
    } else {
      // Create activity record if doesn't exist
      await tx.insert(schema.activities).values({
        user_id: userId,
        activity_slug: activitySlug,
        level: 1,
        xp: xpBreakdown.final_xp,
      });
    }

    // Section level-up
    const [currentSection] = await tx
      .select()
      .from(schema.sections)
      .where(
        and(
          eq(schema.sections.user_id, userId),
          eq(schema.sections.section_slug, activityDef.section_slug)
        )
      );

    if (currentSection) {
      const newXp = currentSection.xp + xpBreakdown.final_xp;
      const levelUpResult = checkLevelUp(newXp, currentSection.level);

      await tx
        .update(schema.sections)
        .set({ xp: levelUpResult.remainingXP, level: levelUpResult.newLevel })
        .where(
          and(
            eq(schema.sections.user_id, userId),
            eq(schema.sections.section_slug, activityDef.section_slug)
          )
        );

      if (levelUpResult.leveled) {
        sectionLevelUp = {
          scope: "section",
          scope_slug: activityDef.section_slug,
          previous_level: currentSection.level,
          new_level: levelUpResult.newLevel,
          remaining_xp: levelUpResult.remainingXP,
        };
      }
    } else {
      await tx.insert(schema.sections).values({
        user_id: userId,
        section_slug: activityDef.section_slug,
        level: 1,
        xp: xpBreakdown.final_xp,
      });
    }

    // Hero level-up
    const [user] = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    const newHeroXp = user.hero_xp + xpBreakdown.final_xp;
    const heroLevelUpResult = checkLevelUp(newHeroXp, user.hero_level);

    if (heroLevelUpResult.leveled) {
      await tx
        .update(schema.users)
        .set({ hero_level: heroLevelUpResult.newLevel, hero_xp: heroLevelUpResult.remainingXP })
        .where(eq(schema.users.id, userId));

      heroLevelUp = {
        scope: "hero",
        previous_level: user.hero_level,
        new_level: heroLevelUpResult.newLevel,
        remaining_xp: heroLevelUpResult.remainingXP,
      };
    } else {
      await tx
        .update(schema.users)
        .set({ hero_xp: newHeroXp })
        .where(eq(schema.users.id, userId));
    }

    // Step 15-16: Update streaks
    const today_str = new Date().toISOString().split("T")[0];
    const streakResult = await updateStreak(tx, userId, "activity", activitySlug, today_str);

    const sectionStreakResult = await updateStreak(
      tx,
      userId,
      "section",
      activityDef.section_slug,
      today_str
    );

    // Step 17: If goalId, update shared goal members
    if (goalId) {
      await tx
        .update(schema.shared_goal_members)
        .set({
          contribution_value: sql`${schema.shared_goal_members.contribution_value} + ${value}`,
        })
        .where(
          and(
            eq(schema.shared_goal_members.goal_id, goalId),
            eq(schema.shared_goal_members.user_id, userId)
          )
        );
    }

    // Step 18: If eventParticipantId, update event participants
    if (eventParticipantId) {
      await tx
        .update(schema.event_participants)
        .set({
          contribution_value: sql`${schema.event_participants.contribution_value} + ${value}`,
        })
        .where(eq(schema.event_participants.id, eventParticipantId));
    }

    // Step 19: COMMIT (implicit with transaction)

    const personalBestsImproved = improvedBests.map((pb) => ({
      inputKey: pb.input_key,
      label: intensityConfigs.find((ic) => ic.input_key === pb.input_key)?.label || pb.input_key,
      oldValue: personalBests.find((p) => p.input_key === pb.input_key)?.best_value || 0,
      newValue: pb.best_value,
    }));

    return {
      xpBreakdown,
      activityLevelUp,
      sectionLevelUp,
      heroLevelUp,
      pendingPerkChoices,
      streakUpdated: [streakResult, sectionStreakResult].filter((s) => s !== null) as any[],
      personalBestsImproved,
    };
  });
}

async function updateStreak(
  tx: any,
  userId: string,
  scope: "activity" | "section",
  scope_slug: string,
  today_str: string
) {
  const existing = await tx.query.streaks.findFirst({
    where: and(
      eq(schema.streaks.user_id, userId),
      eq(schema.streaks.scope, scope),
      eq(schema.streaks.scope_slug, scope_slug)
    ),
  });

  if (!existing) {
    await tx.insert(schema.streaks).values({
      user_id: userId,
      scope,
      scope_slug,
      current_streak: 1,
      longest_streak: 1,
      last_log_date: today_str,
    });

    return {
      scope,
      scope_slug,
      current_streak: 1,
      longest_streak: 1,
      updated: true,
    };
  }

  const lastLogDate = existing.last_log_date;
  let newStreak = existing.current_streak;
  let longestStreak = existing.longest_streak;

  // Same day: no-op
  if (lastLogDate === today_str) {
    return null;
  }

  // Check if consecutive day
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterday_str = yesterday.toISOString().split("T")[0];

  if (lastLogDate === yesterday_str) {
    newStreak++;
    longestStreak = Math.max(longestStreak, newStreak);
  } else {
    // Gap: reset
    newStreak = 1;
  }

  await tx
    .update(schema.streaks)
    .set({
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_log_date: today_str,
    })
    .where(
      and(
        eq(schema.streaks.user_id, userId),
        eq(schema.streaks.scope, scope),
        eq(schema.streaks.scope_slug, scope_slug)
      )
    );

  return {
    scope,
    scope_slug,
    current_streak: newStreak,
    longest_streak: longestStreak,
    updated: true,
  };
}
