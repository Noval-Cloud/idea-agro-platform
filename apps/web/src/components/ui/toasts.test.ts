import { describe, expect, it } from "vite-plus/test";
import { withToast } from "./toasts";

describe("withToast", () => {
  it("puts the newest last", () => {
    expect(withToast([{ id: 1, text: "Draft saved." }], { id: 2, text: "Published." })).toEqual([
      { id: 1, text: "Draft saved." },
      { id: 2, text: "Published." },
    ]);
  });

  it("shows a repeated text once, as the newest, so its time starts again", () => {
    const shown = [
      { id: 1, text: "Order saved." },
      { id: 2, text: "Published." },
    ];
    expect(withToast(shown, { id: 3, text: "Order saved." })).toEqual([
      { id: 2, text: "Published." },
      { id: 3, text: "Order saved." },
    ]);
  });

  it("keeps only the newest few", () => {
    const shown = [1, 2, 3].map((id) => ({ id, text: `Text ${id}` }));
    expect(withToast(shown, { id: 4, text: "Text 4" }).map((toast) => toast.id)).toEqual([2, 3, 4]);
  });
});
