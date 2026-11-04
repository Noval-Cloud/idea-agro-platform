import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { indicatorIds } from "../../../data/indicators";
import type { Manifest } from "./data";
import { loadSummaryStats } from "./data";
import {
  failure,
  isUnavailableAnswer,
  markUnavailable,
  reportUnavailable,
  shownWithout,
  unavailableIn,
  UnavailableError,
  withheldNow,
} from "./unavailable";

const PROBLEM = "urn:idea-agro:problem:indicator-temporarily-unavailable";
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("shownWithout", () => {
  it("leaves out the indicators hidden at build time and at runtime", () => {
    const built = indicatorIds.filter((id) => id !== "et");
    expect(shownWithout(built, ["divtfe"], ["rh"])).toEqual(
      indicatorIds.filter((id) => !["et", "divtfe", "rh"].includes(id)),
    );
  });
});

describe("failure", () => {
  it("tells the unavailable answer from a wrong route", async () => {
    expect(await failure(answer(404, { type: PROBLEM }), "map")).toBeInstanceOf(UnavailableError);
    expect(await failure(answer(404, { type: "about:blank" }), "map")).not.toBeInstanceOf(UnavailableError);
    expect(await failure(answer(500, { type: PROBLEM }), "map")).not.toBeInstanceOf(UnavailableError);
    expect(await failure(new Response("not json", { status: 404 }), "map")).not.toBeInstanceOf(UnavailableError);
  });

  it("reads the answer of the generated client", () => {
    expect(isUnavailableAnswer(404, { type: PROBLEM })).toBe(true);
    expect(isUnavailableAnswer(200, { type: PROBLEM })).toBe(false);
  });
});

const problem = () => answer(404, { type: PROBLEM });

describe("what the API withholds", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks an indicator once, whatever the number of answers", () => {
    markUnavailable("rh");
    markUnavailable("rh");
    expect(withheldNow().filter((id) => id === "rh")).toHaveLength(1);
  });

  it("reports only the unavailable answer", () => {
    reportUnavailable("et", new Error("500"));
    expect(withheldNow()).not.toContain("et");
    reportUnavailable("et", new UnavailableError("404"));
    expect(withheldNow()).toContain("et");
  });

  it("marks the indicator of values the API withholds", async () => {
    vi.stubGlobal("fetch", async () => problem());
    await expect(loadSummaryStats("seccionales", "csue")).rejects.toThrow();
    expect(withheldNow()).toContain("csue");
  });
});

describe("unavailableIn", () => {
  it("lists the indicators the catalog marks", () => {
    const manifest = { indicators: { ppna: {}, rh: { unavailable: true } } } as unknown as Manifest;
    expect(unavailableIn(manifest)).toEqual(["rh"]);
    expect(unavailableIn(null)).toEqual([]);
  });
});
