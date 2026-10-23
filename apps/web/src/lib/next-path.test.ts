import { describe, expect, it } from "vite-plus/test";
import { nextPath } from "./next-path";

const origin = "https://idea-agro.example.org";
const fallback = "/account/";

describe("nextPath", () => {
  it("keeps an address of this site", () => {
    expect(nextPath("/explore/?d=seccionales#map", origin, fallback)).toBe(`${origin}/explore/?d=seccionales#map`);
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

  it.each([
    "/..//evil.example.com/phish",
    "/.//evil.example.com",
    "/a/..//evil.example.com",
    "/%2e%2e//evil.example.com",
  ])("keeps %j on this site", (wanted) => {
    const result = new URL(nextPath(wanted, origin, fallback), origin);
    expect(result.origin).toBe(origin);
  });

  it("falls back without a next", () => {
    expect(nextPath(null, origin, fallback)).toBe(fallback);
  });
});
