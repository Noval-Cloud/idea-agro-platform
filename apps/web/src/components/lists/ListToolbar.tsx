import type { ReactNode } from "react";

/**
 * A list's header: what narrows the list on the left, how it shows and what to do with it on the right.
 * It stays under the site header while the rows scroll, spanning the page's content area edge to edge.
 */
export function ListToolbar({ children, end }: { children: ReactNode; end: ReactNode }) {
  return (
    <div className="sticky top-(--ia-layout-header) z-(--ia-layer-sticky) -mx-gutter border-b border-line bg-canvas px-gutter py-3 lg:-mx-10 lg:px-10">
      <div className="flex max-w-(--ia-layout-page) flex-wrap items-center gap-2">
        <div className="flex min-w-0 grow flex-wrap items-center gap-2">{children}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div>
      </div>
    </div>
  );
}

/** How many rows show, said aloud when a search or filter changes it. */
export function ListCount({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="px-1 text-sm whitespace-nowrap text-ink-subtle tabular-nums">
      {children}
    </p>
  );
}
