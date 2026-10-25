import { useRef, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { iconSize } from "@/design/tokens";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  icon: ReactNode;
  /** A link opens as a link (new tab, copy address); otherwise `onSelect` runs. */
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  /** The action puts focus somewhere itself (a field it opens), so closing the menu leaves focus alone. */
  movesFocus?: boolean;
};

/** A row's or card's actions behind one button; the one that destroys sits apart, last. */
export function RowMenu({ id, label, actions }: { id?: string; label: string; actions: RowAction[] }) {
  const chosen = useRef<RowAction | null>(null);
  const safe = actions.filter((a) => !a.danger);
  const danger = actions.filter((a) => a.danger);
  const item = (action: RowAction) =>
    action.href ? (
      <DropdownMenuItem key={action.label} asChild>
        <a href={action.href}>
          {action.icon}
          {action.label}
        </a>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        key={action.label}
        danger={action.danger}
        onSelect={() => {
          chosen.current = action;
          action.onSelect?.();
        }}
      >
        {action.icon}
        {action.label}
      </DropdownMenuItem>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        id={id}
        aria-label={label}
        className="relative inline-flex size-9 items-center justify-center rounded-sm text-ink-subtle hover:bg-action-soft hover:text-ink data-[state=open]:bg-action-soft data-[state=open]:text-ink"
      >
        <MoreHorizontal size={iconSize.md} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          if (chosen.current?.movesFocus) event.preventDefault();
          chosen.current = null;
        }}
      >
        {safe.map(item)}
        {safe.length > 0 && danger.length > 0 && <DropdownMenuSeparator />}
        {danger.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
