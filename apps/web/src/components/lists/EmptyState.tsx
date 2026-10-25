import type { ReactNode } from "react";

/** What an empty list, or a search with no results, means and what to do about it. */
export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-surface-muted text-ink-muted [&_svg]:size-5">
        {icon}
      </div>
      <h2 className="text-base font-medium text-ink">{title}</h2>
      {body && <p className="max-w-md text-sm text-ink-muted">{body}</p>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
