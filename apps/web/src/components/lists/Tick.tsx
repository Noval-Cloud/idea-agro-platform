import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** A round tick, as when forwarding a message: a real checkbox for keyboards and readers, drawn as a circle. */
export function Tick({ checked, onChange, className }: { checked: boolean; onChange: () => void; className?: string }) {
  // The hidden checkbox stays inside the tick, so focusing it scrolls the tick into view.
  return (
    <span className="relative grid shrink-0">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border border-line-strong text-transparent transition-colors duration-(--ia-motion-fast) peer-checked:border-action peer-checked:bg-action peer-checked:text-action-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
          className,
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </span>
  );
}
