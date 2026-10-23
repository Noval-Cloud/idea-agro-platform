import { describe, expect, it } from "vite-plus/test";
import { nextPath } from "./next-path";

const origin = "https://idea-agro.example.org";
const fallback = "/account/";

describe("nextPath", () => {
  it("keeps a path of this site", () => {
    expect(nextPath("/explore/?d=seccionales#map", origin, fallback)).toBe("/explore/?d=seccionales#map");
  });

  it.each([
    "https://evil.example.com/",
    "//evil.example.com/",
    "/\\evil.example.com/",
    "/\t/evil.example.com",
    "/\n/evil.example.com",
    "javascript:alert(1)",
    "http:evil.example.com",
  ])("refuses %j", (wanted) => {
    expect(nextPath(wanted, origin, fallback)).toBe(fallback);
  });

  it("falls back without a next", () => {
    expect(nextPath(null, origin, fallback)).toBe(fallback);
  });
});
