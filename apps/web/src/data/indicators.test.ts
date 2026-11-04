import { describe, expect, it } from "vite-plus/test";
import { indicatorIds, linkedIndicator, type IndicatorId } from "./indicators";

const without = (...hidden: IndicatorId[]) => indicatorIds.filter((id) => !hidden.includes(id));

describe("linkedIndicator", () => {
  it("opens the indicator a link names while it is shown", () => {
    expect(linkedIndicator("rh", without("et"))).toBe("rh");
  });

  it("opens the default indicator for a link that names a hidden one, or none", () => {
    expect(linkedIndicator("rh", without("rh"))).toBe("ppna");
    expect(linkedIndicator(null, indicatorIds)).toBe("ppna");
    expect(linkedIndicator("nothing", indicatorIds)).toBe("ppna");
  });

  it("opens the first shown indicator while productivity is hidden", () => {
    expect(linkedIndicator(null, without("ppna"))).toBe("apar");
    expect(linkedIndicator("ppna", without("ppna", "apar"))).toBe("cob");
  });

  it("opens nothing when every indicator is hidden", () => {
    expect(linkedIndicator("ppna", [])).toBeUndefined();
  });
});
