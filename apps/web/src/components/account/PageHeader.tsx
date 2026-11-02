import type { ReactNode } from "react";

/** A page's title in the account, with what it says about itself right beside it. */
export function PageHeader({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-8">
      <h2 id={id} className="text-xl font-medium text-ink">
        {title}
      </h2>
      {children}
    </div>
  );
}
