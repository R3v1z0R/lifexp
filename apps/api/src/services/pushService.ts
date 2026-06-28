import type { LevelUpEvent } from "@lifexp/types";
import { db } from "../db";
import { device_tokens } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

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

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function sendPush(messages: ExpoPushMessage[]): Promise<{ invalidTokens: string[] }> {
  const invalidTokens: string[] = [];
  for (const batch of chunk(messages, CHUNK_SIZE)) {
    if (batch.length === 0) continue;
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
    } catch {
      // Network failure: a push is best-effort and must never break the caller.
      continue;
    }
    if (!res.ok) continue;
    const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    tickets.forEach((ticket, i) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        invalidTokens.push(batch[i].to);
      }
    });
  }
  return { invalidTokens };
}

const SCOPE_RANK: Record<LevelUpEvent["scope"], number> = { hero: 3, section: 2, activity: 1 };

export async function dispatchPush(input: {
  userId: string;
  levelUps: LevelUpEvent[];
  perkChoiceCount: number;
}): Promise<void> {
  try {
    const { userId, levelUps, perkChoiceCount } = input;
    if (levelUps.length === 0 && perkChoiceCount === 0) return;

    const rows = await db
      .select({ token: device_tokens.expo_push_token })
      .from(device_tokens)
      .where(eq(device_tokens.user_id, userId));
    if (rows.length === 0) return;

    const topLevelUp =
      levelUps.length > 0
        ? [...levelUps].sort((a, b) => SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope])[0]
        : null;

    const messages = rows.flatMap(({ token }) => {
      const msgs = [];
      if (topLevelUp) msgs.push(buildLevelUpPush(token, topLevelUp));
      if (perkChoiceCount > 0) msgs.push(buildPerkChoicePush(token, perkChoiceCount));
      return msgs;
    });

    const { invalidTokens } = await sendPush(messages);
    if (invalidTokens.length > 0) {
      await db.delete(device_tokens).where(inArray(device_tokens.expo_push_token, invalidTokens));
    }
  } catch (err) {
    console.error("dispatchPush failed (non-fatal):", err);
  }
}
