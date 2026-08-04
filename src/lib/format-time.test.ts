import { describe, it, expect } from "vitest";
import { formatTimestamp } from "./format-time";

/**
 * These branches are unreachable from the E2E suite: every fixture note is created with
 * `createdAt: 1–7` (epoch 1970), so only the "older" branch ever ran there (#133).
 *
 * `now` is fixed to Wednesday 5 Aug 2026 12:00 local, which puts the start of the week at
 * Sunday 2 Aug. Expectations are written as the same `toLocale*` call the branch itself
 * would make, so they assert *which branch was taken* without depending on the runner's
 * locale — CI and a laptop format "Tue" or "12:00 PM" differently.
 */
const now = new Date(2026, 7, 5, 12, 0, 0);
const startOfToday = new Date(2026, 7, 5, 0, 0, 0);
const startOfWeek = new Date(2026, 7, 2, 0, 0, 0);

const asTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const asWeekday = (d: Date) => d.toLocaleDateString([], { weekday: "short" });
const asMonthDay = (d: Date) => d.toLocaleDateString([], { month: "short", day: "numeric" });

describe("formatTimestamp", () => {
  it("the fixture assumptions still hold", () => {
    expect(now.getDay()).toBe(3); // Wednesday
    expect(startOfWeek.getDay()).toBe(0); // Sunday
  });

  describe("today → clock time", () => {
    it("formats a timestamp from earlier today as a time", () => {
      const d = new Date(2026, 7, 5, 9, 30);
      expect(formatTimestamp(d.getTime(), now)).toBe(asTime(d));
    });

    it("includes midnight today, the very first instant of the branch", () => {
      expect(formatTimestamp(startOfToday.getTime(), now)).toBe(asTime(startOfToday));
    });

    it("still uses the time branch for a timestamp later today", () => {
      const d = new Date(2026, 7, 5, 23, 45);
      expect(formatTimestamp(d.getTime(), now)).toBe(asTime(d));
    });
  });

  describe("earlier this week → weekday name", () => {
    it("formats yesterday as a short weekday", () => {
      const d = new Date(2026, 7, 4, 15, 0);
      expect(formatTimestamp(d.getTime(), now)).toBe(asWeekday(d));
      expect(formatTimestamp(d.getTime(), now)).toBe("Tue");
    });

    it("takes the weekday branch one millisecond before today begins", () => {
      const d = new Date(startOfToday.getTime() - 1);
      expect(formatTimestamp(d.getTime(), now)).toBe(asWeekday(d));
    });

    it("includes the very start of the week (Sunday midnight)", () => {
      expect(formatTimestamp(startOfWeek.getTime(), now)).toBe(asWeekday(startOfWeek));
    });
  });

  describe("older than this week → month and day", () => {
    it("falls to month/day one millisecond before the week begins", () => {
      const d = new Date(startOfWeek.getTime() - 1);
      expect(formatTimestamp(d.getTime(), now)).toBe(asMonthDay(d));
    });

    it("formats a timestamp from months ago", () => {
      const d = new Date(2026, 2, 14, 8, 0);
      expect(formatTimestamp(d.getTime(), now)).toBe(asMonthDay(d));
    });

    it("formats the epoch, which is what every E2E fixture note uses", () => {
      expect(formatTimestamp(1, now)).toBe(asMonthDay(new Date(1)));
    });
  });

  it("the three branches produce genuinely different output", () => {
    const today = formatTimestamp(new Date(2026, 7, 5, 9, 30).getTime(), now);
    const thisWeek = formatTimestamp(new Date(2026, 7, 4, 15, 0).getTime(), now);
    const older = formatTimestamp(new Date(2026, 2, 14, 8, 0).getTime(), now);
    expect(new Set([today, thisWeek, older]).size).toBe(3);
  });

  it("defaults `now` to the present, so callers need not pass one", () => {
    expect(formatTimestamp(Date.now())).toBe(asTime(new Date()));
  });
});
