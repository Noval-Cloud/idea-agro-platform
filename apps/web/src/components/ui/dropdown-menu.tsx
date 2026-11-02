import * as React from "react";
import { DropdownMenu as Menu } from "radix-ui";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "end",
  ...props
}: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "ia-pop z-(--ia-layer-popover) min-w-52 rounded-md border border-line bg-surface p-1 text-ink shadow-overlay",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

/** A menu entry; `danger` marks the one that destroys something. */
export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof Menu.Item> & { danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-action-soft [&_svg]:size-4 [&_svg]:shrink-0",
        danger ? "text-danger" : "[&_svg]:text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export const DropdownMenuRadioGroup = Menu.RadioGroup;

/** One of a group's choices; the one in use reads stronger. */
export function DropdownMenuRadioItem({ className, ...props }: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={cn(
        "group flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-sm text-ink-muted outline-none select-none data-highlighted:bg-action-soft data-[state=checked]:font-medium data-[state=checked]:text-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}
