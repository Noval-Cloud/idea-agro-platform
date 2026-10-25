import * as React from "react";
import { Tooltip as Tip } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = Tip.Provider;

/** A short label for an icon-only control; the control keeps its own accessible name. */
export function Tooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: React.ComponentProps<typeof Tip.Content>["side"];
  children: React.ReactElement;
}) {
  return (
    <Tip.Root>
      <Tip.Trigger asChild>{children}</Tip.Trigger>
      <Tip.Portal>
        <Tip.Content
          side={side}
          sideOffset={6}
          className={cn(
            "ia-pop z-(--ia-layer-tooltip) rounded-sm bg-ink px-2 py-1 text-xs font-medium text-canvas shadow-raised",
          )}
        >
          {label}
        </Tip.Content>
      </Tip.Portal>
    </Tip.Root>
  );
}
