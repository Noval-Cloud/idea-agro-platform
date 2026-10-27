import { describe, expect, it } from "vite-plus/test";
import { compare, readYears, writeYears, type Years } from "./years";

const read = (query: string) => readYears(new URLSearchParams(query));
const written = (years: Years) => {
  const params = new URLSearchParams("ind=ppna");
  writeYears(params, years);
  return params.toString();
};

describe("readYears", () => {
  it("compares the explorer's year and returns the map to it", () => {
    expect(read("year=2019")).toEqual({ main: null, compared: [{ year: 2019, slot: 1 }], map: 2019 });
  });

  it("keeps each year in its slot, a free one included", () => {
    expect(read("year=,2022&map=2019").compared).toEqual([{ year: 2022, slot: 2 }]);
  });

  it("drops repeated years, the main one and anything not a year", () => {
    expect(read("main=2020&year=2019,2019").compared).toEqual([{ year: 2019, slot: 1 }]);
    expect(read("main=2020&year=2020,abc").compared).toEqual([]);
  });

  it("round-trips through the URL", () => {
    const years: Years = { main: 2021, compared: [{ year: 2010, slot: 2 }], map: 2019 };
    expect(read(written(years))).toEqual(years);
    expect(written({ main: null, compared: [], map: null })).toBe("ind=ppna");
  });
});

describe("compare", () => {
  it("takes the free slot", () => {
    expect(compare([{ year: 2019, slot: 2 }], 2010, () => true)).toEqual([
      { year: 2019, slot: 2 },
      { year: 2010, slot: 1 },
    ]);
  });

  it("replaces a year the view does not draw when every slot is taken", () => {
    const now = [
      { year: 2001, slot: 1 as const },
      { year: 2015, slot: 2 as const },
    ];
    expect(compare(now, 2010, (year) => year !== 2001)).toEqual([
      { year: 2015, slot: 2 },
      { year: 2010, slot: 1 },
    ]);
    expect(compare(now, 2010, () => true)).toEqual(now);
  });

  it("does not add a year twice", () => {
    expect(compare([{ year: 2019, slot: 1 }], 2019, () => true)).toEqual([{ year: 2019, slot: 1 }]);
  });
});
