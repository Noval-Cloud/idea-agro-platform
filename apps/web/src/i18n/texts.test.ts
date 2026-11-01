import { describe, expect, it } from "vite-plus/test";
import { isMarkdown, texts, withEdits } from "./texts";

const catalog = { zone: { title: "Zona {name}", count: { one: "{count} zona", other: "{count} zonas" } } } as const;

describe("texts", () => {
  it("lists every text by its key", () => {
    expect(texts(catalog)).toEqual([
      ["zone.title", "Zona {name}"],
      ["zone.count", { one: "{count} zona", other: "{count} zonas" }],
    ]);
  });

  it("puts edits in place of defaults, and leaves out what does not fit", () => {
    const edited = withEdits(catalog, {
      "zone.title": "Área {name}",
      "zone.count": "not plural",
      "zone.gone": "no such text",
    });
    expect(edited.zone.title).toBe("Área {name}");
    expect(edited.zone.count).toEqual(catalog.zone.count);
    expect("gone" in edited.zone).toBe(false);
    expect(catalog.zone.title).toBe("Zona {name}");
  });

  it("knows which texts allow Markdown", () => {
    expect(isMarkdown("indicators.items.ppna.method")).toBe(true);
    expect(isMarkdown("indicators.items.ppna.name")).toBe(false);
  });
});
