import { describe, expect, test } from "vite-plus/test";
import { chooseSort, decodeSort, encodeSort } from "./sort";

describe("chooseSort", () => {
  test("the current key turns around", () => {
    expect(chooseSort({ key: "name", descending: false }, "name", false)).toEqual({ key: "name", descending: true });
  });

  test("another key starts in its usual direction", () => {
    expect(chooseSort({ key: "name", descending: true }, "joined", true)).toEqual({ key: "joined", descending: true });
    expect(chooseSort({ key: "joined", descending: false }, "name", false)).toEqual({ key: "name", descending: false });
  });
});

test("a sort goes through the address unchanged", () => {
  const sort = { key: "joined", descending: true } as const;
  expect(decodeSort(encodeSort(sort), ["name", "joined"], { key: "name", descending: false })).toEqual(sort);
});
