import { describe, it, expect, vi, afterEach } from "vitest";
import { buildLevelUpPush, buildPerkChoicePush, sendPush } from "./pushService";
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendPush", () => {
  it("returns no invalid tokens when all tickets are ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }, { status: "ok" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendPush([
      { to: "ExponentPushToken[a]", title: "t", body: "b" },
      { to: "ExponentPushToken[b]", title: "t", body: "b" },
    ]);

    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collects tokens whose ticket is DeviceNotRegistered", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: "ok" },
          { status: "error", details: { error: "DeviceNotRegistered" } },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendPush([
      { to: "ExponentPushToken[ok]", title: "t", body: "b" },
      { to: "ExponentPushToken[dead]", title: "t", body: "b" },
    ]);

    expect(res.invalidTokens).toEqual(["ExponentPushToken[dead]"]);
  });

  it("chunks into batches of 100", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url, init: any) => {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ data: body.map(() => ({ status: "ok" })) }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const messages = Array.from({ length: 250 }, (_, i) => ({
      to: `ExponentPushToken[${i}]`,
      title: "t",
      body: "b",
    }));
    await sendPush(messages);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns no invalid tokens and does not throw when given an empty list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendPush([]);
    expect(res.invalidTokens).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
