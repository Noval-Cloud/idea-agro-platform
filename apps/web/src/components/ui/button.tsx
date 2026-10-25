import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors duration-(--ia-motion-fast) ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-action text-action-ink hover:bg-action-hover",
        outline: "border border-line-strong bg-surface text-ink hover:bg-action-soft",
        ghost: "text-ink hover:bg-action-soft",
        danger: "bg-danger text-danger-ink hover:bg-danger/90",
        link: "text-link underline-offset-(--ia-link-underline-offset) hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
