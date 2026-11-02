import { describe, expect, test } from "vite-plus/test";
import { matches, rowText } from "./filter";

describe("rowText", () => {
  test("takes every text, number and list, but the fields left out", () => {
    const row = {
      id: "a1",
      name: "Ana Pérez",
      year: 2026,
      tags: ["editor", "admin"],
      disabled: true,
      picture: "x.png",
    };
    expect(rowText(row, ["id", "picture"])).toBe("Ana Pérez 2026 editor admin");
  });
});

describe("matches", () => {
  test("finds every word in any field, without accents or case", () => {
    expect(matches("ana PEREZ", "Ana Pérez", "ana@example.org")).toBe(true);
    expect(matches("ana gómez", "Ana Pérez")).toBe(false);
  });
});
