import * as React from "react";
import { Switch as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** A setting that is on or off, and takes effect as soon as it changes. */
export function Switch({ className, ...props }: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-pill bg-line-strong p-0.5 transition-colors duration-(--ia-motion-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-action",
        className,
      )}
      {...props}
    >
      <Primitive.Thumb className="block size-5 rounded-pill bg-surface shadow-raised transition-transform duration-(--ia-motion-fast) data-[state=checked]:translate-x-4" />
    </Primitive.Root>
  );
}
