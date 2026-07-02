import * as SecureStore from "expo-secure-store";
import { formatElapsed, measuredValue, timerStore, timerController } from "./timer";

beforeEach(async () => {
  (SecureStore as any).__reset();
  await timerController.reset();
});

describe("formatElapsed", () => {
  it("formats zero as 0:00", () => {
    expect(formatElapsed(0)).toBe("0:00");
  });
  it("zero-pads seconds", () => {
    expect(formatElapsed(5_000)).toBe("0:05");
  });
  it("formats minutes and seconds", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
  });
  it("does not cap minutes at 60", () => {
    expect(formatElapsed(75 * 60_000)).toBe("75:00");
  });
  it("clamps negative input to 0:00", () => {
    expect(formatElapsed(-1000)).toBe("0:00");
  });
});

describe("measuredValue", () => {
  it("rounds elapsed ms to whole minutes for a minutes activity", () => {
    // 4m40s -> 5 minutes
    expect(measuredValue(4 * 60_000 + 40_000, "minutes")).toBe(5);
  });
  it("never returns less than 1 minute", () => {
    expect(measuredValue(2_000, "minutes")).toBe(1);
  });
  it("converts to whole hours for an hours activity", () => {
    // 90 minutes -> round(1.5) = 2 hours
    expect(measuredValue(90 * 60_000, "hours")).toBe(2);
  });
  it("never returns less than 1 hour for an hours activity", () => {
    expect(measuredValue(3 * 60_000, "hours")).toBe(1);
  });
});

describe("timerStore", () => {
  it("returns null when nothing is stored", async () => {
    expect(await timerStore.get()).toBeNull();
  });
  it("round-trips a stored timer state", async () => {
    await timerStore.set({ startedAt: 1_700_000_000_000, label: "Meditation" });
    expect(await timerStore.get()).toEqual({
      startedAt: 1_700_000_000_000,
      label: "Meditation",
    });
  });
  it("clear removes the stored state", async () => {
    await timerStore.set({ startedAt: 123 });
    await timerStore.clear();
    expect(await timerStore.get()).toBeNull();
  });
  it("returns null on corrupt stored JSON instead of throwing", async () => {
    await SecureStore.setItemAsync("lifexp.timer", "{not json");
    expect(await timerStore.get()).toBeNull();
  });
});

describe("timerController", () => {
  it("starts a timer, exposing it via the snapshot and persisting it", async () => {
    await timerController.start("Focus");
    const snap = timerController.getSnapshot();
    expect(snap?.label).toBe("Focus");
    expect(typeof snap?.startedAt).toBe("number");
    expect(await timerStore.get()).not.toBeNull();
  });

  it("notifies subscribers on start and stop", async () => {
    const cb = jest.fn();
    const unsub = timerController.subscribe(cb);
    await timerController.start();
    await timerController.stop("minutes");
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    await timerController.start();
    expect(cb).toHaveBeenCalledTimes(2); // no more calls after unsubscribe
  });

  it("stop clears the snapshot, storage, and returns the measured value", async () => {
    await timerController.start();
    const value = await timerController.stop("minutes");
    expect(value).toBe(1); // just-started -> rounds up to the 1 minute floor
    expect(timerController.getSnapshot()).toBeNull();
    expect(await timerStore.get()).toBeNull();
  });

  it("stop with no running timer returns null", async () => {
    expect(await timerController.stop("minutes")).toBeNull();
  });

  it("load hydrates the snapshot from persisted storage", async () => {
    await timerStore.set({ startedAt: 42, label: "Resumed" });
    const loaded = await timerController.load();
    expect(loaded?.label).toBe("Resumed");
    expect(timerController.getSnapshot()?.startedAt).toBe(42);
  });
});
