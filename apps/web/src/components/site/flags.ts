import type { Locale } from "@/i18n";
import uy from "flag-icons/flags/4x3/uy.svg?url";
import gb from "flag-icons/flags/4x3/gb.svg?url";
import br from "flag-icons/flags/4x3/br.svg?url";

/**
 * The flag shown for each language. A flag names a country, not a language: each one is the
 * country whose variant the copy is written in (Uruguayan Spanish, British English, Brazilian
 * Portuguese), and the language's name always goes with it (tooltip, menu, screen readers).
 */
export const flags: Record<Locale, string> = { es: uy, en: gb, pt: br };

/** Rendered size of a flag (4:3), in pixels. */
export const flagSize = { width: 20, height: 15 } as const;
