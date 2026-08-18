import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addDaysUTC,
  endOfWeekIso,
  endOfWeekLabel,
  formatShortDateUTC,
  formatTimeLocal,
  fridayOfWeekUTC,
  isWeekendUTC,
  localWallTimeToUtcParts,
  mondayOfWeekUTC,
  nextWeekdayIsoUTC,
  parseDateOnly,
  prevWeekdayIsoUTC,
  shortWeekdayUTC,
  toIsoDateUTC,
  todayIsoUTC,
  weekdayOnOrAfterIsoUTC,
} from "./calendarDates";

// Anchor: 2026-07-20 is a Monday. So 07-17 Fri, 07-18 Sat, 07-19 Sun, 07-13 prev-Mon,
// 07-22 Wed, 07-24 Fri.

describe("parse / serialize (UTC date-only)", () => {
  it("round-trips YYYY-MM-DD through parseDateOnly/toIsoDateUTC", () => {
    expect(toIsoDateUTC(parseDateOnly("2026-02-09"))).toBe("2026-02-09");
  });

  it("addDaysUTC crosses a month boundary without shifting", () => {
    expect(toIsoDateUTC(addDaysUTC(parseDateOnly("2026-07-31"), 1))).toBe("2026-08-01");
    expect(toIsoDateUTC(addDaysUTC(parseDateOnly("2026-07-20"), -3))).toBe("2026-07-17");
  });
});

describe("weekend / weekday arithmetic", () => {
  it("isWeekendUTC is true for Sat/Sun, false for weekdays", () => {
    expect(isWeekendUTC(parseDateOnly("2026-07-18"))).toBe(true); // Sat
    expect(isWeekendUTC(parseDateOnly("2026-07-19"))).toBe(true); // Sun
    expect(isWeekendUTC(parseDateOnly("2026-07-20"))).toBe(false); // Mon
  });

  it("nextWeekdayIsoUTC is strictly after and skips the weekend (Fri -> Mon)", () => {
    expect(nextWeekdayIsoUTC("2026-07-17")).toBe("2026-07-20");
    expect(nextWeekdayIsoUTC("2026-07-20")).toBe("2026-07-21");
  });

  it("weekdayOnOrAfterIsoUTC returns the day itself when already a weekday, else next Mon", () => {
    expect(weekdayOnOrAfterIsoUTC("2026-07-20")).toBe("2026-07-20"); // Mon -> itself
    expect(weekdayOnOrAfterIsoUTC("2026-07-18")).toBe("2026-07-20"); // Sat -> Mon
  });

  it("prevWeekdayIsoUTC is strictly before and skips the weekend (Mon -> Fri)", () => {
    expect(prevWeekdayIsoUTC("2026-07-20")).toBe("2026-07-17");
  });
});

describe("week anchors", () => {
  it("mondayOfWeekUTC finds the containing week's Monday (incl. Sunday -> prior Monday)", () => {
    expect(toIsoDateUTC(mondayOfWeekUTC(parseDateOnly("2026-07-22")))).toBe("2026-07-20"); // Wed
    expect(toIsoDateUTC(mondayOfWeekUTC(parseDateOnly("2026-07-19")))).toBe("2026-07-13"); // Sun -> prev Mon
  });

  it("fridayOfWeekUTC is that Monday + 4", () => {
    expect(toIsoDateUTC(fridayOfWeekUTC(parseDateOnly("2026-07-22")))).toBe("2026-07-24");
  });

  it("shortWeekdayUTC / formatShortDateUTC render UTC-anchored labels", () => {
    expect(shortWeekdayUTC(parseDateOnly("2026-07-20"))).toBe("Mon");
    expect(formatShortDateUTC(parseDateOnly("2026-07-13"))).toBe("13 Jul");
  });
});

describe("now-dependent helpers (fixed clock)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00Z")); // a Monday
  });
  afterEach(() => vi.useRealTimers());

  it("todayIsoUTC returns the current calendar day", () => {
    expect(todayIsoUTC()).toBe("2026-07-06");
  });

  it("endOfWeekIso is this week's Friday at 23:59:59Z", () => {
    expect(endOfWeekIso()).toBe("2026-07-10T23:59:59.000Z");
  });

  it("endOfWeekLabel names this week's Friday", () => {
    expect(endOfWeekLabel()).toBe("Fri 10 Jul");
  });
});

// These read the viewer's LOCAL clock; CI runs in UTC, so local == UTC here.
describe("local-time formatting (UTC runner)", () => {
  it("localWallTimeToUtcParts passes hour/minute through under UTC", () => {
    expect(localWallTimeToUtcParts("2026-07-20", 9, 30)).toEqual({ hour: 9, minute: 30 });
  });

  it("formatTimeLocal renders HH:MM", () => {
    expect(formatTimeLocal("2026-07-20T14:30:00Z")).toBe("14:30");
  });
});
