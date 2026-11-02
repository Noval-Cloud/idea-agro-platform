import type { ReactNode } from "react";

/** A page's title in the account, with what it says about itself beside it. */
export function PageHeader({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pt-8">
      <h2 id={id} className="text-xl font-medium text-ink">
        {title}
      </h2>
      {children}
    </div>
  );
}
