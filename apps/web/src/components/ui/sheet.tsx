import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { buttonVariants } from "./button";

type Props = {
  open: boolean;
  /** Asked to close by the close button, Escape or a click outside; the owner decides whether it does. */
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** The close button's name. */
  close: string;
  /** Actions kept in view at the bottom while the body scrolls. */
  footer?: ReactNode;
  children: ReactNode;
};

/** What had focus when a dialog opened, to give it back on closing: the dialogs here open from code. */
function useOpener(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  return (event: Event) => {
    if (!opener.current?.isConnected) return;
    event.preventDefault();
    opener.current.focus();
  };
}

/** Escape clears a search being typed before it closes the dialog around it. */
const keepSearch = (event: KeyboardEvent) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "search" && target.value) event.preventDefault();
};

/**
 * A panel over the right of the page, the whole screen on phones, for working on one thing while the list it
 * came from stays behind. Focus returns to what opened it.
 */
export function Sheet({ open, onClose, title, description, close, footer, children }: Props) {
  const giveBack = useOpener(open);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ia-fade fixed inset-0 z-(--ia-layer-modal) bg-scrim/40" />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={giveBack}
          onEscapeKeyDown={keepSearch}
          className="ia-sheet fixed inset-y-0 right-0 z-(--ia-layer-modal) flex w-full flex-col bg-surface text-ink shadow-overlay sm:w-[min(42rem,100vw)] sm:border-l sm:border-line"
        >
          <header className="flex items-start gap-3 border-b border-line py-3 pr-3 pl-5 sm:pl-6">
            <div className="grid min-w-0 grow gap-0.5 pt-1.5">
              <Dialog.Title className="text-lg font-medium text-ink">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm break-words text-ink-muted">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close aria-label={close} className={buttonVariants({ variant: "ghost", size: "icon" })}>
              <X aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="grow overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
          {footer && <footer className="border-t border-line bg-surface px-5 py-3 sm:px-6">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
