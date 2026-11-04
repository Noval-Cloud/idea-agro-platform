import { describe, expect, it } from "vite-plus/test";
import { shortCitation } from "./citation";

describe("shortCitation", () => {
  it("cites one author by surname and year", () => {
    expect(shortCitation({ authors: "Monteith, J. L.", year: 1972 })).toEqual({
      key: "citeOne",
      values: { surname: "Monteith", year: 1972 },
    });
    expect(shortCitation({ authors: "INIA", year: 2020 })).toEqual({
      key: "citeOne",
      values: { surname: "INIA", year: 2020 },
    });
  });

  it("cites two authors by both surnames", () => {
    expect(shortCitation({ authors: "Cazzuli, F. & Paruelo, J. M. (eds.)", year: 2023 })).toEqual({
      key: "citeTwo",
      values: { surname: "Cazzuli", secondSurname: "Paruelo", year: 2023 },
    });
    expect(shortCitation({ authors: "Baeza, S., & Paruelo, J. M.", year: 2018 }).values).toEqual({
      surname: "Baeza",
      secondSurname: "Paruelo",
      year: 2018,
    });
    expect(shortCitation({ authors: "Camba Sans, G. & Dupont, J.-M.", year: 2020 }).values).toEqual({
      surname: "Camba Sans",
      secondSurname: "Dupont",
      year: 2020,
    });
    expect(shortCitation({ authors: "MGAP & INIA", year: 2021 }).values).toEqual({
      surname: "MGAP",
      secondSurname: "INIA",
      year: 2021,
    });
  });

  it("cites three or more authors by the first one, et al.", () => {
    expect(shortCitation({ authors: "Paruelo, J. M., Staiano, L. & Repetto, J. M.", year: 2025 })).toEqual({
      key: "citeSeveral",
      values: { surname: "Paruelo", year: 2025 },
    });
    expect(shortCitation({ authors: "Baeza, S. et al.", year: 2022 })).toEqual({
      key: "citeSeveral",
      values: { surname: "Baeza", year: 2022 },
    });
    expect(shortCitation({ authors: "MGAP, DIEA & INIA", year: 2021 })).toEqual({
      key: "citeSeveral",
      values: { surname: "MGAP", year: 2021 },
    });
    expect(shortCitation({ authors: "Lezama, Pereira & Paruelo", year: 2019 }).key).toBe("citeSeveral");
    expect(shortCitation({ authors: "Baeza et al.", year: 2022 })).toEqual({
      key: "citeSeveral",
      values: { surname: "Baeza", year: 2022 },
    });
  });
});
