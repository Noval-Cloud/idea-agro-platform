import { useLayoutEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";
import { buttonVariants } from "./button";

/**
 * Asks before something that cannot be undone. Open while `open`; answers through `onConfirm` or `onCancel`.
 * Focus goes back to `returnFocus` when given, else to what had it when the dialog opened.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirm,
  cancel,
  tone = "danger",
  onConfirm,
  onCancel,
  returnFocus,
}: {
  open: boolean;
  /** `danger` for what destroys; `primary` for a warning before a change that can be undone. */
  tone?: "danger" | "primary";
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  // There is no trigger to return to: the dialog opens from code.
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
        <AlertDialog.Content
          onCloseAutoFocus={(event) => {
            const target = returnFocus?.() ?? (opener.current?.isConnected ? opener.current : null);
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
          className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-md border border-line bg-surface p-6 text-ink shadow-overlay"
        >
          <AlertDialog.Title className="text-lg font-medium">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-ink-muted">{body}</AlertDialog.Description>
          <div className="mt-3 flex justify-end gap-2">
            <AlertDialog.Cancel className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {cancel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={(event) => {
                // The answer closes the dialog; Radix closing it too would also count as a cancel.
                event.preventDefault();
                onConfirm();
              }}
              className={buttonVariants({ variant: tone, size: "sm" })}
            >
              {confirm}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export type Question = {
  title: string;
  body: string;
  confirm: string;
  tone?: "danger" | "primary";
  returnFocus?: () => HTMLElement | null;
};

/** A confirmation to await, like `window.confirm` but in the page's own dialog. Render `dialog` once. */
export function useConfirm(cancel: string) {
  const [asked, setAsked] = useState<(Question & { answer: (yes: boolean) => void }) | null>(null);
  // Focus returns after the dialog has closed and `asked` is gone: the question's choice is kept apart.
  const returnTo = useRef<Question["returnFocus"]>(undefined);
  const ask = (question: Question) => {
    returnTo.current = question.returnFocus;
    return new Promise<boolean>((answer) => setAsked({ ...question, answer }));
  };
  const close = (yes: boolean) => {
    asked?.answer(yes);
    setAsked(null);
  };
  const dialog = (
    <ConfirmDialog
      open={asked !== null}
      title={asked?.title ?? ""}
      body={asked?.body ?? ""}
      confirm={asked?.confirm ?? ""}
      cancel={cancel}
      tone={asked?.tone}
      returnFocus={() => returnTo.current?.() ?? null}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
  return { ask, dialog };
}
