import { describe, expect, it } from "vite-plus/test";
import { periodOf } from "./periods";

// A Wednesday.
const now = new Date(2026, 10, 4, 15, 0);

describe("periodOf", () => {
  it("files today and yesterday by calendar day", () => {
    expect(periodOf(new Date(2026, 10, 4, 0, 5), now)).toEqual({ kind: "today" });
    expect(periodOf(new Date(2026, 10, 3, 23, 59), now)).toEqual({ kind: "yesterday" });
    expect(periodOf(new Date(2026, 10, 3, 0, 0), now)).toEqual({ kind: "yesterday" });
  });

  it("files the rest of the week from Monday, then the month, then each earlier month", () => {
    expect(periodOf(new Date(2026, 10, 2, 9, 0), now)).toEqual({ kind: "week" });
    expect(periodOf(new Date(2026, 10, 1, 9, 0), now)).toEqual({ kind: "month" });
    expect(periodOf(new Date(2026, 9, 31, 9, 0), now)).toEqual({ kind: "older", year: 2026, month: 9 });
  });

  it("starts the week on Monday when today is Sunday", () => {
    const sunday = new Date(2026, 10, 8, 12, 0);
    expect(periodOf(new Date(2026, 10, 2, 8, 0), sunday)).toEqual({ kind: "week" });
    expect(periodOf(new Date(2026, 10, 1, 8, 0), sunday)).toEqual({ kind: "month" });
  });
});
