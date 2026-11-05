import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
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
    /** Its action is running: disabled, with a spinner over its content, which keeps its width and its name. */
    busy?: boolean;
  };

export function Button({ className, variant, size, asChild = false, busy = false, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }), busy && "relative");
  if (asChild) return <Slot.Root data-slot="button" className={classes} {...props} />;
  const { children, disabled, ...rest } = props;
  return (
    <button data-slot="button" className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? (
        <>
          {/* Transparent, not hidden: the content still sizes the button and names it. */}
          <span className="inline-flex items-center justify-center gap-[inherit] opacity-0">{children}</span>
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
            <LoaderCircle className="animate-spin motion-reduce:animate-none" />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
