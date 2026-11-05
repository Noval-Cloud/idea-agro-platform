import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Toast } from "radix-ui";
import { CircleCheck, X } from "lucide-react";
import { toastDuration } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import { withToast, type Toast as Shown } from "./toasts";

const Confirm = createContext<(text: string) => void>(() => undefined);

/** Confirms that an action succeeded, in a toast that goes by itself. */
export const useToast = () => useContext(Confirm);

/**
 * Shows the toasts asked for inside it, in the bottom-left corner, over any panel. Screen readers hear each one
 * through a status region; hovering or focusing one holds it.
 */
export function Toaster({
  label,
  region,
  close,
  children,
}: {
  /** Read before each toast's text. */
  label: string;
  /** The toasts' region, which F8 reaches. */
  region: string;
  /** The close button's name. */
  close: string;
  children: ReactNode;
}) {
  const [toasts, setToasts] = useState<Shown[]>([]);
  const next = useRef(0);
  const show = useCallback((text: string) => setToasts((now) => withToast(now, { id: ++next.current, text })), []);
  const drop = (id: number) => setToasts((now) => now.filter((toast) => toast.id !== id));

  return (
    <Toast.Provider label={label} duration={toastDuration} swipeDirection="left">
      <Confirm value={show}>{children}</Confirm>
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          type="background"
          onOpenChange={(open) => !open && drop(toast.id)}
          className="ia-toast flex items-start gap-3 rounded-md border border-line bg-surface py-2 pr-2 pl-4 text-sm text-ink shadow-overlay data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
        >
          <CircleCheck aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-action" />
          <Toast.Description className="min-w-0 grow py-1">{toast.text}</Toast.Description>
          <Toast.Close aria-label={close} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}>
            <X aria-hidden="true" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport
        label={region}
        className="fixed bottom-0 left-0 z-(--ia-layer-toast) m-0 flex w-full list-none flex-col gap-2 p-4 outline-none sm:max-w-sm"
      />
    </Toast.Provider>
  );
}
