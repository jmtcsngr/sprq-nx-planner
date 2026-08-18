import { describe, expect, it } from "vitest";

import type { PlateOut, RunOut, StageOut } from "@/types/schedule";

import {
  allStages,
  findContinuation,
  groupCyclesByInstrumentAndDay,
  isCellOpen,
  padStages,
  resolveCell,
} from "./groupCyclesByInstrumentAndDay";

function baseStage(overrides: Partial<StageOut> = {}): StageOut {
  return {
    slot_index: 0,
    well: "A01",
    cell_use_id: 10,
    cell_id: 100,
    cell_ref: "CELL-000100",
    cell_home_well: "A01",
    use_number: 1,
    cell_max_uses: 3,
    run_time_hours: 24,
    sample_id: 1,
    sample_pool_id: "SAMPLE-1",
    insert_size_bp: null,
    barcodes: [],
    cell_use_status: "planned",
    cell_status: "open",
    cell_has_failed_use: false,
    tray_position: 1,
    tray_id: null,
    window_hours_elapsed: null,
    reuse_not_ready_hours: null,
    notes: null,
    ...overrides,
  };
}

function basePlate(stages: StageOut[] = [], overrides: Partial<PlateOut> = {}): PlateOut {
  return {
    plate_id: 1,
    plate_index: 1,
    acquire_date: "2026-07-20",
    is_reuse: false,
    movie_hours: 24,
    status: "planned",
    planned_start_at: "2026-07-20T09:00:00Z",
    planned_end_at: "2026-07-21T09:00:00Z",
    actual_start_at: null,
    actual_end_at: null,
    stages,
    ...overrides,
  };
}

function baseRun(overrides: Partial<RunOut> = {}, stages: StageOut[] = []): RunOut {
  return {
    run_id: 1,
    instrument_serial: "84047",
    load_date: "2026-07-20",
    run_name: null,
    status: "planned",
    lock_until: "2026-07-20T15:00:00Z",
    is_locked: false,
    effective_start_at: null,
    starts_later_than_requested: false,
    plates: [basePlate(stages)],
    ...overrides,
  };
}

describe("isCellOpen", () => {
  it("is open when no run exists yet and no continuation applies", () => {
    expect(isCellOpen(undefined, undefined)).toBe(true);
  });

  it("is open when the run has no stages at all", () => {
    expect(isCellOpen(baseRun({}, []), undefined)).toBe(true);
  });

  it("is NOT open when the run has a real planned stage", () => {
    expect(isCellOpen(baseRun({}, [baseStage({ cell_use_status: "planned" })]), undefined)).toBe(false);
  });

  it("is open when every stage is a cancelled stopped-cell marker (across both plates)", () => {
    const run = baseRun({
      plates: [
        basePlate([baseStage({ cell_use_id: 10, cell_use_status: "cancelled" })]),
        basePlate([baseStage({ cell_use_id: 11, slot_index: 4, well: "A01", cell_use_status: "cancelled" })], {
          plate_id: 2,
          plate_index: 2,
        }),
      ],
    });
    expect(isCellOpen(run, undefined)).toBe(true);
  });

  it("is NOT open when a cancelled marker sits alongside a real placement", () => {
    const run = baseRun({}, [
      baseStage({ cell_use_id: 10, cell_use_status: "cancelled" }),
      baseStage({ cell_use_id: 12, slot_index: 1, well: "B01", cell_use_status: "planned" }),
    ]);
    expect(isCellOpen(run, undefined)).toBe(false);
  });

  it("is NOT open when the only stage recorded a real QC outcome (failed/aborted/completed/started)", () => {
    for (const status of ["failed", "aborted", "completed", "started"]) {
      expect(isCellOpen(baseRun({}, [baseStage({ cell_use_status: status })]), undefined)).toBe(false);
    }
  });

  it("is NOT open when no run exists yet but an earlier run's continuation still occupies the day", () => {
    const continuation = { run: baseRun({ run_id: 2, load_date: "2026-07-17" }), acquiresToday: false };
    expect(isCellOpen(undefined, continuation)).toBe(false);
  });
});

describe("findContinuation", () => {
  it("returns nothing when no earlier run occupies the day", () => {
    const byDate = new Map<string, RunOut>([
      ["2026-07-20", baseRun({ run_id: 1, load_date: "2026-07-20", lock_until: "2026-07-20T15:00:00Z" })],
    ]);
    expect(findContinuation(byDate, "2026-07-21")).toBeUndefined();
  });

  it("leaves a day open when an earlier run's lock only ends partway through it", () => {
    // The instrument frees up at 18:00 on the 21st, so the 21st is still a valid load day
    // (a new run just starts once the lock clears) - it must NOT read as a carry-over.
    const earlier = baseRun({ run_id: 1, load_date: "2026-07-20", lock_until: "2026-07-21T18:00:00Z" });
    const byDate = new Map<string, RunOut>([["2026-07-20", earlier]]);
    expect(findContinuation(byDate, "2026-07-21")).toBeUndefined();
  });

  it("flags a lock carry-over on a day the lock spans in full", () => {
    // A longer movie whose lock runs into the *next* day keeps the instrument busy for the
    // whole of the 21st, so the 21st is genuinely closed.
    const earlier = baseRun({ run_id: 1, load_date: "2026-07-20", lock_until: "2026-07-22T06:00:00Z" });
    const byDate = new Map<string, RunOut>([["2026-07-20", earlier]]);
    const cont = findContinuation(byDate, "2026-07-21");
    expect(cont?.run.run_id).toBe(1);
    expect(cont?.acquiresToday).toBe(false);
  });

  it("flags (and prefers) a reuse Plate 2 acquiring exactly on the day", () => {
    const reuseRun = baseRun({
      run_id: 5,
      load_date: "2026-07-20",
      lock_until: "2026-07-20T15:00:00Z", // its own lock doesn't reach the 21st
      plates: [
        basePlate([baseStage()], { plate_id: 50, plate_index: 1, acquire_date: "2026-07-20" }),
        basePlate([baseStage({ slot_index: 4, use_number: 2 })], {
          plate_id: 51,
          plate_index: 2,
          acquire_date: "2026-07-21",
          is_reuse: true,
        }),
      ],
    });
    const byDate = new Map<string, RunOut>([["2026-07-20", reuseRun]]);
    const cont = findContinuation(byDate, "2026-07-21");
    expect(cont?.run.run_id).toBe(5);
    expect(cont?.acquiresToday).toBe(true);
  });
});

describe("groupCyclesByInstrumentAndDay", () => {
  it("indexes runs by instrument then load_date (one run per instrument-day)", () => {
    const grouped = groupCyclesByInstrumentAndDay([
      baseRun({ run_id: 1, instrument_serial: "84047", load_date: "2026-07-20" }),
      baseRun({ run_id: 2, instrument_serial: "84047", load_date: "2026-07-21" }),
      baseRun({ run_id: 3, instrument_serial: "84093", load_date: "2026-07-20" }),
    ]);
    expect(grouped.get("84047")?.get("2026-07-20")?.run_id).toBe(1);
    expect(grouped.get("84047")?.get("2026-07-21")?.run_id).toBe(2);
    expect(grouped.get("84093")?.get("2026-07-20")?.run_id).toBe(3);
    expect(grouped.get("84093")?.size).toBe(1);
  });
});

describe("allStages", () => {
  it("flattens stages across both plates in order", () => {
    const run = baseRun({
      plates: [
        basePlate([baseStage({ cell_use_id: 1 })]),
        basePlate([baseStage({ cell_use_id: 2, slot_index: 4 })], { plate_id: 2, plate_index: 2 }),
      ],
    });
    expect(allStages(run).map((s) => s.cell_use_id)).toEqual([1, 2]);
  });
});

describe("padStages", () => {
  it("returns eight nulls for an undefined run", () => {
    expect(padStages(undefined)).toEqual(Array(8).fill(null));
  });

  it("places each stage at its slot_index, leaving the rest null", () => {
    const run = baseRun({}, [
      baseStage({ slot_index: 0, cell_use_id: 1 }),
      baseStage({ slot_index: 5, cell_use_id: 2 }),
    ]);
    const padded = padStages(run);
    expect(padded).toHaveLength(8);
    expect(padded[0]?.cell_use_id).toBe(1);
    expect(padded[5]?.cell_use_id).toBe(2);
    expect(padded.filter((s) => s !== null)).toHaveLength(2);
  });
});

describe("resolveCell", () => {
  it("returns the run for a day that has one, no continuation, and closed", () => {
    const run = baseRun({}, [baseStage({ cell_use_status: "planned" })]);
    const res = resolveCell(new Map<string, RunOut>([["2026-07-20", run]]), "2026-07-20");
    expect(res.run?.run_id).toBe(1);
    expect(res.continuation).toBeUndefined();
    expect(res.open).toBe(false);
  });

  it("is open for an empty day with no continuation", () => {
    const res = resolveCell(new Map<string, RunOut>(), "2026-07-20");
    expect(res.run).toBeUndefined();
    expect(res.open).toBe(true);
  });

  it("is closed for an empty day a prior run's lock still spans", () => {
    const earlier = baseRun({ run_id: 9, load_date: "2026-07-20", lock_until: "2026-07-22T06:00:00Z" });
    const res = resolveCell(new Map<string, RunOut>([["2026-07-20", earlier]]), "2026-07-21");
    expect(res.run).toBeUndefined();
    expect(res.continuation?.run.run_id).toBe(9);
    expect(res.open).toBe(false);
  });
});
