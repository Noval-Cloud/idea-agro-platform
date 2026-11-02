import type { ReactNode } from "react";

/**
 * A list's header: what narrows the list on the left, how it shows and what to do with it on the right. Under them,
 * the filter controls when shown, and the filters applied. It stays under the site header while the rows scroll,
 * spanning the page's content area edge to edge.
 */
export function ListToolbar({
  children,
  end,
  filters,
  applied,
}: {
  children: ReactNode;
  end: ReactNode;
  /** The filter controls, with the id the toggle that shows them points to. */
  filters?: { id: string; shown: boolean; controls: ReactNode };
  applied?: ReactNode;
}) {
  return (
    <div className="sticky top-(--ia-layout-header) z-(--ia-layer-sticky) -mx-gutter border-b border-line bg-canvas px-gutter py-3 lg:-mx-10 lg:px-10">
      <div className="grid max-w-(--ia-layout-page) gap-3">
        {/* On a phone the right-hand icons keep the first row, and the left wraps under itself. */}
        <div className="flex items-start gap-2 sm:flex-wrap sm:items-center">
          <div className="flex min-w-0 grow flex-wrap items-center gap-2">{children}</div>
          <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div>
        </div>
        {filters && (
          <div id={filters.id} hidden={!filters.shown} className="flex flex-wrap items-center gap-2">
            {filters.controls}
          </div>
        )}
        {applied}
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

/** For a list under the toolbar: whatever gets focus scrolls clear of the header and the toolbar. */
export const underToolbar = "[&_:is(a,button,input)]:scroll-mt-56";
