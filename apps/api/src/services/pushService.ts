import type { LevelUpEvent } from "@lifexp/types";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const SCOPE_LABEL: Record<LevelUpEvent["scope"], string> = {
  hero: "Hero",
  section: "Section",
  activity: "Activity",
};

export function buildLevelUpPush(token: string, levelUp: LevelUpEvent): ExpoPushMessage {
  const label = SCOPE_LABEL[levelUp.scope];
  return {
    to: token,
    title: "Level up! ✦",
    body: `Your ${label} reached level ${levelUp.new_level}.`,
    data: { kind: "level_up", scope: levelUp.scope, level: levelUp.new_level },
  };
}

export function buildPerkChoicePush(token: string, count: number): ExpoPushMessage {
  const body = count === 1 ? "You have a perk to choose." : `You have ${count} perks to choose.`;
  return {
    to: token,
    title: "Choose your perk",
    body,
    data: { kind: "perk_choice", count },
  };
}
