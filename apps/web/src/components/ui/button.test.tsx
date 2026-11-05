import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { Button } from "./button";

const render = (props: { busy?: boolean; disabled?: boolean }) =>
  renderToStaticMarkup(<Button {...props}>Publish</Button>);

describe("Button", () => {
  it("is disabled and shows a spinner while busy, its content kept to size and name it", () => {
    const html = render({ busy: true });
    expect(html).toMatch(/^<button[^>]* disabled=""/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<span class="[^"]*opacity-0[^"]*">Publish<\/span>/);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*><svg[^>]*animate-spin/);
  });

  it("is a plain button otherwise", () => {
    const html = render({});
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("<svg");
    expect(html).toContain(">Publish</button>");
    expect(render({ disabled: true })).toContain('disabled=""');
  });
});
