import { describe, expect, it } from "vite-plus/test";
import { markdown } from "./markdown";

describe("markdown", () => {
  it("writes paragraphs, emphasis and links", () => {
    expect(markdown("Una **frase** con *énfasis* y [un link](https://inia.uy).\n\nOtro párrafo.")).toBe(
      '<p>Una <strong>frase</strong> con <em>énfasis</em> y <a href="https://inia.uy" rel="noopener" target="_blank">un link</a>.</p><p>Otro párrafo.</p>',
    );
  });

  it("writes lists", () => {
    expect(markdown("- uno\n- dos")).toBe("<ul><li>uno</li><li>dos</li></ul>");
    expect(markdown("1. uno\n2. dos")).toBe("<ol><li>uno</li><li>dos</li></ol>");
  });

  it("shows raw HTML and unsafe links as written", () => {
    expect(markdown('<img src=x onerror="alert(1)">')).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
    expect(markdown("[x](javascript:alert(1))")).toBe("<p>[x](javascript:alert(1))</p>");
  });

  it("keeps addresses whole and refuses ones that lead to another site", () => {
    expect(markdown("[a](https://x.org/*b*)")).toBe(
      '<p><a href="https://x.org/*b*" rel="noopener" target="_blank">a</a></p>',
    );
    expect(markdown("[a](/\\evil.example)")).toBe("<p>[a](/\\evil.example)</p>");
    expect(markdown("[a](//evil.example)")).toBe("<p>[a](//evil.example)</p>");
  });

  it("links to pages of the site without a new tab", () => {
    expect(markdown("[mapa](/explore/)")).toBe('<p><a href="/explore/">mapa</a></p>');
  });
});
