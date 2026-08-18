import { describe, expect, it } from "vitest";

import { PLATE_INDICES, SLOT_INDICES, cellKey, plateOfSlot, sampleDragId, slotKey } from "./gridKeys";

describe("gridKeys", () => {
  it("cellKey joins instrument and load date", () => {
    expect(cellKey("84047", "2026-07-20")).toBe("84047::2026-07-20");
  });

  it("slotKey appends the slot index and stays distinct per slot", () => {
    expect(slotKey("84047", "2026-07-20", 3)).toBe("84047::2026-07-20::3");
    expect(slotKey("84047", "2026-07-20", 0)).not.toBe(slotKey("84047", "2026-07-20", 1));
  });

  it("sampleDragId prefixes the sample id", () => {
    expect(sampleDragId(42)).toBe("sample::42");
  });

  it("SLOT_INDICES is 0..7 and PLATE_INDICES splits into two plates of four", () => {
    expect(SLOT_INDICES).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(PLATE_INDICES).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6, 7],
    ]);
  });

  it("plateOfSlot maps 0-3 to plate 0 and 4-7 to plate 1", () => {
    expect(plateOfSlot(0)).toBe(0);
    expect(plateOfSlot(3)).toBe(0);
    expect(plateOfSlot(4)).toBe(1);
    expect(plateOfSlot(7)).toBe(1);
  });
});
