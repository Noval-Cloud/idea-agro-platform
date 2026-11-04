import { describe, expect, it } from "vite-plus/test";
import { shortCitation } from "./citation";

describe("shortCitation", () => {
  it("cites one author by surname and year", () => {
    expect(shortCitation({ authors: "Monteith, J. L.", year: 1972 })).toEqual({
      several: false,
      values: { surname: "Monteith", year: 1972 },
    });
  });

  it("marks several authors, joined or abbreviated", () => {
    expect(shortCitation({ authors: "Paruelo, J. M., Staiano, L. & Repetto, J.", year: 2025 })).toEqual({
      several: true,
      values: { surname: "Paruelo", year: 2025 },
    });
    expect(shortCitation({ authors: "Baeza, S. et al.", year: 2022 }).several).toBe(true);
  });

  it("keeps an author without initials whole", () => {
    expect(shortCitation({ authors: "INIA", year: 2020 }).values.surname).toBe("INIA");
  });
});
