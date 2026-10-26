import * as React from "react";
import { Tabs as Root } from "radix-ui";
import { cn } from "@/lib/utils";

export const Tabs = Root.Root;
export const TabsContent = Root.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof Root.List>) {
  return <Root.List className={cn("-mb-px flex gap-6 overflow-x-auto [scrollbar-width:none]", className)} {...props} />;
}

/** A tab with an underline when chosen; `count` sits beside its label. */
export function TabsTrigger({
  className,
  children,
  count,
  ...props
}: React.ComponentProps<typeof Root.Trigger> & { count?: string }) {
  return (
    <Root.Trigger
      className={cn(
        "relative inline-flex h-11 shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-(--ia-motion-fast) hover:text-ink data-[state=active]:text-ink",
        "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-pill after:bg-transparent data-[state=active]:after:bg-ink",
        // Keyboard focus shows as a soft background and the underline in the focus color, not as a box.
        "-mx-1.5 rounded-xs px-1.5 focus-visible:bg-surface-selected focus-visible:text-ink focus-visible:outline-none focus-visible:after:bg-focus",
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-pill bg-surface-muted px-1.5 py-px text-xs text-ink-muted tabular-nums">{count}</span>
      )}
    </Root.Trigger>
  );
}
