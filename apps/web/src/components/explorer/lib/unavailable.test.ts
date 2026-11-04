import { describe, expect, it } from "vite-plus/test";
import { indicatorIds } from "../../../data/indicators";
import { failure, isUnavailableAnswer, shownWithout, UnavailableError } from "./unavailable";

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
