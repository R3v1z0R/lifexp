import type {
  ActivityDefinition,
  ActivityIntensityConfig,
  PersonalBest,
  Perk,
  StreakBonusTier,
  XpMultiplierCap,
  XpBreakdown,
} from "@lifexp/types";

// Layer 1: Base XP
export function computeBaseXP(value: number, definition: ActivityDefinition): number {
  return Math.round(value * definition.effort_minutes_per_unit);
}

// Layer 2a: Score intensity input
export function scoreIntensityInput(
  inputValue: number,
  config: ActivityIntensityConfig,
  personalBest?: PersonalBest
): number {
  const { score_min_value, score_max_value, scoring_mode, vs_personal_best } = config;

  // If vs_personal_best is true and value beats personal best
  if (vs_personal_best && personalBest) {
    const beatsPb =
      scoring_mode === "higher_is_better"
        ? inputValue > personalBest.best_value
        : inputValue < personalBest.best_value;
    if (beatsPb) return 100;
  }

  // Clamp and normalize to 0-100
  const clamped =
    scoring_mode === "higher_is_better"
      ? Math.max(score_min_value, Math.min(score_max_value, inputValue))
      : Math.min(score_max_value, Math.max(score_min_value, inputValue));

  if (scoring_mode === "higher_is_better") {
    return ((clamped - score_min_value) / (score_max_value - score_min_value)) * 100;
  } else {
    return ((score_max_value - clamped) / (score_max_value - score_min_value)) * 100;
  }
}

// Layer 2b: Compute intensity score (average of all inputs)
export function computeIntensityScore(
  inputs: Record<string, number>,
  configs: ActivityIntensityConfig[],
  personalBests: PersonalBest[]
): number | null {
  if (!configs.length || !Object.keys(inputs).length) return null;

  const scores: number[] = [];
  for (const config of configs) {
    const inputValue = inputs[config.input_key];
    if (inputValue !== undefined) {
      const personalBest = personalBests.find((pb) => pb.input_key === config.input_key);
      const score = scoreIntensityInput(inputValue, config, personalBest);
      scores.push(score);
    }
  }

  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// Layer 2c: Intensity multiplier via piecewise linear interpolation
export function computeIntensityMultiplier(
  score: number | null,
  configs: ActivityIntensityConfig[],
  cap: XpMultiplierCap
): number {
  if (score === null || !configs.length) return 1.0;

  const config = configs[0];
  const { multiplier_at_score_0, multiplier_at_score_50, multiplier_at_score_100 } = config;

  let multiplier = 1.0;
  if (score <= 50) {
    multiplier = multiplier_at_score_0 + ((score / 50) * (multiplier_at_score_50 - multiplier_at_score_0));
  } else {
    multiplier = multiplier_at_score_50 + (((score - 50) / 50) * (multiplier_at_score_100 - multiplier_at_score_50));
  }

  return Math.min(multiplier, cap.cap_value);
}

// Layer 3: Apply perk multipliers (additive stacking)
export function applyPerkMultipliers(
  perks: Perk[],
  activitySlug: string,
  sectionSlug: string,
  cap: XpMultiplierCap
): { multiplier: number; appliedSlugs: string[] } {
  let baseMultiplier = 1.0;
  const appliedSlugs: string[] = [];

  for (const perk of perks) {
    if (
      perk.effect_type === "xp_multiplier" &&
      (!perk.trigger_slug || perk.trigger_slug === activitySlug || perk.trigger_slug === sectionSlug)
    ) {
      baseMultiplier += (perk.effect_value - 1.0);
      appliedSlugs.push(perk.slug);
    }
  }

  return {
    multiplier: Math.min(Math.max(baseMultiplier, 1.0), cap.cap_value),
    appliedSlugs,
  };
}

// Layer 4: Apply streak bonus
export function applyStreakBonus(
  currentStreak: number,
  tiers: StreakBonusTier[],
  cap: XpMultiplierCap
): number {
  let bonusPercent = 0;
  for (const tier of tiers) {
    if (currentStreak >= tier.days_required) {
      bonusPercent = tier.bonus_percent;
    }
  }
  const multiplier = 1.0 + bonusPercent / 100;
  return Math.min(multiplier, cap.cap_value);
}

// Layer 5: Apply daily XP cap
export function applyDailyXpCap(
  xp: number,
  alreadyEarnedToday: number,
  cap: number
): number {
  const remaining = Math.max(0, cap - alreadyEarnedToday);
  return Math.min(xp, remaining);
}

// Full pipeline
export interface ComputeFinalXPInput {
  baseXP: number;
  intensityScore: number | null;
  intensityConfigs: ActivityIntensityConfig[];
  intensityMultiplierCap: XpMultiplierCap;
  perks: Perk[];
  activitySlug: string;
  sectionSlug: string;
  perkStackCap: XpMultiplierCap;
  currentStreak: number;
  streakBonusTiers: StreakBonusTier[];
  streakCap: XpMultiplierCap;
  alreadyEarnedToday: number;
  dailyXpCap: number;
  totalXpCap: XpMultiplierCap;
}

export function computeFinalXP(input: ComputeFinalXPInput): XpBreakdown {
  const intensityMultiplier = computeIntensityMultiplier(
    input.intensityScore,
    input.intensityConfigs,
    input.intensityMultiplierCap
  );
  const xpAfterIntensity = input.baseXP * intensityMultiplier;

  const { multiplier: perkMultiplier, appliedSlugs } = applyPerkMultipliers(
    input.perks,
    input.activitySlug,
    input.sectionSlug,
    input.perkStackCap
  );
  const xpAfterPerks = xpAfterIntensity * perkMultiplier;

  const streakMultiplier = applyStreakBonus(
    input.currentStreak,
    input.streakBonusTiers,
    input.streakCap
  );
  const xpAfterStreak = xpAfterPerks * streakMultiplier;

  // Clamp to total cap before daily cap
  const xpBeforeDailyCap = Math.min(xpAfterStreak, input.baseXP * input.totalXpCap.cap_value);

  const finalXP = applyDailyXpCap(xpBeforeDailyCap, input.alreadyEarnedToday, input.dailyXpCap);

  return {
    raw_xp: input.baseXP,
    intensity_score: input.intensityScore,
    intensity_multiplier: intensityMultiplier,
    perk_multiplier: perkMultiplier,
    streak_multiplier: streakMultiplier,
    final_xp: Math.round(finalXP),
    applied_perk_slugs: appliedSlugs,
  };
}

// Personal best updates (pure)
export function updatePersonalBests(
  inputs: Record<string, number>,
  configs: ActivityIntensityConfig[],
  existingBests: PersonalBest[]
): PersonalBest[] {
  const improved: PersonalBest[] = [];

  for (const config of configs) {
    const inputValue = inputs[config.input_key];
    if (inputValue === undefined) continue;

    const existingBest = existingBests.find((pb) => pb.input_key === config.input_key);
    const isBetter =
      !existingBest ||
      (config.scoring_mode === "higher_is_better"
        ? inputValue > existingBest.best_value
        : inputValue < existingBest.best_value);

    if (isBetter) {
      improved.push({
        user_id: existingBest?.user_id || "",
        activity_slug: existingBest?.activity_slug || "",
        input_key: config.input_key,
        best_value: inputValue,
        achieved_at: new Date().toISOString(),
      });
    }
  }

  return improved;
}

// Split goal XP
export function splitGoalXP(
  totalXP: number,
  contributions: Record<string, number>,
  floorPercent: number = 0.3
): Record<string, number> {
  const totalContribution = Object.values(contributions).reduce((a, b) => a + b, 0);
  if (totalContribution === 0) {
    const evenSplit = Math.floor(totalXP / Object.keys(contributions).length);
    return Object.keys(contributions).reduce((acc, key) => {
      acc[key] = evenSplit;
      return acc;
    }, {} as Record<string, number>);
  }

  const basePerUser = Math.floor(totalXP * 0.5) / Object.keys(contributions).length;
  const proportionalPool = Math.floor(totalXP * 0.5);
  const floor = Math.floor(basePerUser * floorPercent);

  const result: Record<string, number> = {};
  for (const [userId, contribution] of Object.entries(contributions)) {
    const proportion = contribution / totalContribution;
    const proportionalShare = Math.floor(proportionalPool * proportion);
    result[userId] = basePerUser + proportionalShare;
    result[userId] = Math.max(result[userId], floor);
  }

  return result;
}

// Resolve event (simple ranking)
export function resolveEvent(
  participants: Array<{ user_id: string; contribution_value: number }>
): Array<{ user_id: string; rank: number; bonus_xp: number }> {
  const sorted = [...participants].sort((a, b) => b.contribution_value - a.contribution_value);
  return sorted.map((p, idx) => ({
    user_id: p.user_id,
    rank: idx + 1,
    bonus_xp: idx === 0 ? 50 : idx === 1 ? 30 : idx === 2 ? 20 : 0,
  }));
}

// Sleep XP (bell curve: peak at 8h = 8 XP, 0 outside [5, 10])
export function computeSleepXP(hours: number): number {
  if (hours < 5 || hours > 10) return 0;
  const peak = 8;
  const variance = 2;
  const exponent = -((hours - peak) ** 2) / (2 * variance ** 2);
  return 8 * Math.exp(exponent);
}

// Level progression
export function xpToNextLevel(level: number, base: number = 50): number {
  return Math.floor(base * Math.pow(level, 1.6));
}

// Check for level-up
export function checkLevelUp(
  currentXP: number,
  currentLevel: number,
  base: number = 50
): { leveled: boolean; newLevel: number; remainingXP: number } {
  let xp = currentXP;
  let level = currentLevel;

  while (xp >= xpToNextLevel(level, base)) {
    xp -= xpToNextLevel(level, base);
    level++;
  }

  return {
    leveled: level > currentLevel,
    newLevel: level,
    remainingXP: xp,
  };
}

// Get perk choices
export interface PerkChoiceResult {
  optionA: Perk;
  optionB: Perk;
}

export function getPerkChoices(
  triggerType: string,
  triggerSlug: string | undefined,
  level: number,
  catalogue: Perk[]
): PerkChoiceResult | null {
  const relevant = catalogue.filter(
    (p) =>
      p.trigger_type === triggerType &&
      (!p.trigger_slug || p.trigger_slug === triggerSlug) &&
      p.effect_type === "xp_multiplier"
  );

  if (relevant.length < 2) return null;

  // Simple selection: pick two random perks
  const shuffled = [...relevant].sort(() => Math.random() - 0.5);
  return {
    optionA: shuffled[0],
    optionB: shuffled[1],
  };
}
