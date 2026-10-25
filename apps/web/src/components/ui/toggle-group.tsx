import * as React from "react";
import { ToggleGroup as Group } from "radix-ui";
import { cn } from "@/lib/utils";

/** A segmented control: one choice out of a few, all in view. It always keeps one choice. */
export function Segmented({
  className,
  value,
  onValueChange,
  children,
  ...props
}: {
  className?: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Group.Root
      type="single"
      value={value}
      // Clicking the chosen one again would clear it: that changes nothing instead.
      onValueChange={(next) => next && onValueChange(next)}
      className={cn("inline-flex h-9 shrink-0 items-center gap-0.5 rounded-sm bg-surface-sunken p-0.5", className)}
      {...props}
    >
      {children}
    </Group.Root>
  );
}

export function SegmentedItem({ className, ...props }: React.ComponentProps<typeof Group.Item>) {
  return (
    <Group.Item
      className={cn(
        "inline-flex h-full items-center justify-center gap-1.5 rounded-xs px-3 text-sm whitespace-nowrap text-ink-muted transition-colors duration-(--ia-motion-fast) hover:text-ink aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-raised [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
