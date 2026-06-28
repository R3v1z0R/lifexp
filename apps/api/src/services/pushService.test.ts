import { describe, it, expect } from "vitest";
import { buildLevelUpPush, buildPerkChoicePush } from "./pushService";
import type { LevelUpEvent } from "@lifexp/types";

const hero: LevelUpEvent = {
  scope: "hero",
  previous_level: 4,
  new_level: 5,
  remaining_xp: 12,
};

describe("buildLevelUpPush", () => {
  it("targets the token and names the scope + new level", () => {
    const msg = buildLevelUpPush("ExponentPushToken[abc]", hero);
    expect(msg.to).toBe("ExponentPushToken[abc]");
    expect(msg.title).toBe("Level up! ✦");
    expect(msg.body).toContain("Hero");
    expect(msg.body).toContain("5");
    expect(msg.data).toEqual({ kind: "level_up", scope: "hero", level: 5 });
  });
});

describe("buildPerkChoicePush", () => {
  it("pluralizes and carries a count", () => {
    expect(buildPerkChoicePush("ExponentPushToken[x]", 1).body).toContain("a perk");
    const many = buildPerkChoicePush("ExponentPushToken[x]", 3);
    expect(many.body).toContain("3");
    expect(many.data).toEqual({ kind: "perk_choice", count: 3 });
  });
});
