import * as React from "react";
import { Popover as Pop } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = Pop.Root;
export const PopoverTrigger = Pop.Trigger;
export const PopoverClose = Pop.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: React.ComponentProps<typeof Pop.Content>) {
  return (
    <Pop.Portal>
      <Pop.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={16}
        className={cn(
          "ia-pop z-(--ia-layer-popover) w-[min(24rem,calc(100vw-2rem))] rounded-md border border-line bg-surface p-4 text-ink shadow-overlay",
          className,
        )}
        {...props}
      />
    </Pop.Portal>
  );
}
