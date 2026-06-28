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
