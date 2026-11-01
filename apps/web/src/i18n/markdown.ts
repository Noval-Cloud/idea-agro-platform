/*
 * The small Markdown editors may use in long texts: paragraphs, **bold**, *italics*, [links](https://…) and lists
 * (`- item` or `1. item`). Anything else, raw HTML included, shows as written.
 */

const escape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Links may go to the web, to a page of the site or to a part of the page; nothing else (no `javascript:`, and no
// `//` or `/\`, which browsers read as another site).
const safeHref = (href: string) => /^(https?:\/\/|\/(?![/\\])|#)/.test(href);

const emphasis = (text: string) =>
  text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");

function inline(text: string): string {
  // Links are set aside first, so an asterisk in an address never turns into emphasis.
  const links: string[] = [];
  const rest = escape(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    const target = href.replace(/&amp;/g, "&");
    if (!safeHref(target)) return match;
    const external = /^https?:\/\//.test(target) ? ' rel="noopener" target="_blank"' : "";
    links.push(`<a href="${escape(target)}"${external}>${emphasis(label)}</a>`);
    return `\uE000${links.length - 1}\uE000`;
  });
  return emphasis(rest).replace(/\uE000(\d+)\uE000/g, (_, index: string) => links[Number(index)]);
}

/** The HTML of a Markdown text, safe to put in a page. */
export function markdown(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim());
      if (lines.every((line) => /^[-*] /.test(line)))
        return `<ul>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join("")}</ul>`;
      if (lines.every((line) => /^\d+\. /.test(line)))
        return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\d+\. /, ""))}</li>`).join("")}</ol>`;
      return `<p>${inline(lines.join(" "))}</p>`;
    })
    .join("");
}
