import { describe, it, expect } from "vitest";
import { logDate, previousDateStr, dayStartIso, dateStr } from "./logDates";

describe("log date helpers", () => {
  it("logDate returns 'now' when occurredAt is undefined", () => {
    const before = Date.now();
    const d = logDate(undefined);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("logDate returns the passed occurredAt", () => {
    const when = new Date("2026-03-10T08:00:00.000Z");
    expect(logDate(when).getTime()).toBe(when.getTime());
  });

  it("dayStartIso zeroes the time on the given date", () => {
    const when = new Date("2026-03-10T08:30:00.000Z");
    expect(dayStartIso(when)).toBe("2026-03-10T00:00:00.000Z");
  });

  it("previousDateStr returns the day before as YYYY-MM-DD", () => {
    expect(previousDateStr("2026-03-10")).toBe("2026-03-09");
  });

  it("dateStr returns YYYY-MM-DD of a date (UTC)", () => {
    expect(dateStr(new Date("2026-03-10T23:59:00.000Z"))).toBe("2026-03-10");
  });
});
