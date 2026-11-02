import { describe, expect, test } from "vite-plus/test";
import { dateBounds, dayOf, decodeDates, encodeDates } from "./dates";

// A Wednesday.
const now = new Date(2026, 10, 4, 15, 30);

describe("decodeDates", () => {
  test("reads a preset or a range, and drops what is not a day", () => {
    expect(decodeDates("week")).toEqual({ preset: "week" });
    expect(decodeDates("2026-10-01~2026-10-15")).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(decodeDates("~2026-10-15")).toEqual({ from: "", to: "2026-10-15" });
    expect(decodeDates("yesterday~nope")).toBeNull();
    expect(decodeDates("")).toBeNull();
  });

  test("writes back what it reads", () => {
    for (const value of ["month", "2026-10-01~", "2026-10-01~2026-10-15"])
      expect(encodeDates(decodeDates(value))).toBe(value);
  });
});

describe("dateBounds", () => {
  test("a preset runs from the start of its first day", () => {
    expect(dateBounds({ preset: "today" }, now).since).toEqual(new Date(2026, 10, 4));
    expect(dateBounds({ preset: "week" }, now).since).toEqual(new Date(2026, 10, 2));
    expect(dateBounds({ preset: "month" }, now).since).toEqual(new Date(2026, 10, 1));
  });

  test("a range takes its last day whole", () => {
    expect(dateBounds({ from: "2026-10-01", to: "2026-10-31" }, now)).toEqual({
      since: new Date(2026, 9, 1),
      until: new Date(2026, 10, 1),
    });
    expect(dateBounds({ from: "", to: "2026-10-31" }, now).since).toBeUndefined();
  });

  test("a Sunday belongs to the week that started on Monday", () => {
    expect(dateBounds({ preset: "week" }, new Date(2026, 10, 8, 9)).since).toEqual(new Date(2026, 10, 2));
  });
});

test("dayOf writes the local day", () => {
  expect(dayOf(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
});
