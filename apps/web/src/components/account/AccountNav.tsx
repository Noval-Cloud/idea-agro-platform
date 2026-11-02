import { useEffect, useState } from "react";
import type { Me } from "@idea-agro/api-client";
import type { Locale } from "@/i18n/core";
import { readHint } from "@/lib/account-hint";
import { cn } from "@/lib/utils";
import {
  accountSections,
  accountSubpages,
  createAccountTranslator,
  hasPages,
  type AccountCatalog,
  type AccountSection,
  type AccountSubpage,
} from "./i18n";

type Props = {
  locale: Locale;
  catalog: AccountCatalog;
  section: AccountSection;
  subpage?: AccountSubpage;
  sectionPaths: Record<AccountSection, string>;
  subpagePaths: Record<AccountSubpage, string>;
};

/** The roles that open a section, when it needs one. */
export const sectionRoles: Partial<Record<AccountSection, Me["roles"][number][]>> = {
  content: ["editor", "admin"],
  admin: ["admin"],
};

/** An entry is the page shown, or holds it, or neither. */
const entry = (state: "page" | "holds" | null) =>
  cn(
    "inline-flex h-9 items-center rounded-pill px-3 text-sm whitespace-nowrap transition-colors duration-(--ia-motion-fast) lg:flex lg:h-auto lg:rounded-sm lg:py-2",
    state === "page" && "bg-surface-selected font-medium text-ink",
    state === "holds" && "font-medium text-ink",
    !state && "text-ink-muted hover:text-ink",
  );

/**
 * The account's navigation, on every page of the account: a column beside the content on wide screens, a row
 * of tabs above it on phones. Sections that need a role appear for those who have it; a section's pages hang
 * under it in the column, and on phones fill a second row while the section is open.
 */
export default function AccountNav({ locale, catalog, section, subpage, sectionPaths, subpagePaths }: Props) {
  const { t } = createAccountTranslator(locale, catalog);
  // The roles the session remembers, refreshed whenever the account loads them again.
  const [roles, setRoles] = useState<Me["roles"]>([]);
  useEffect(() => {
    const update = () => setRoles((readHint()?.roles ?? []) as Me["roles"]);
    update();
    addEventListener("account-change", update);
    return () => removeEventListener("account-change", update);
  }, []);
  const visible = accountSections.filter((s) => {
    const needed = sectionRoles[s];
    return !needed || needed.some((role) => roles.includes(role));
  });
  const pages = (s: AccountSection, className: string) =>
    hasPages(s) && (
      <ul className={className}>
        {accountSubpages[s].map((page) => (
          <li key={page} className="shrink-0">
            <a
              href={subpagePaths[page]}
              aria-current={page === subpage ? "page" : undefined}
              className={entry(page === subpage ? "page" : null)}
            >
              {t(`account.subpages.${page}`)}
            </a>
          </li>
        ))}
      </ul>
    );

  return (
    <nav aria-label={t("account.sections.label")} className="grid min-w-0 gap-2 lg:sticky lg:top-6">
      <ul className="-mx-gutter flex gap-1 overflow-x-auto px-gutter lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0">
        {visible.map((s) => (
          <li key={s} className="shrink-0">
            <a
              href={sectionPaths[s]}
              aria-current={s === section && !subpage ? "page" : undefined}
              className={entry(s !== section ? null : subpage ? "holds" : "page")}
            >
              {t(`account.sections.${s}`)}
            </a>
            {pages(s, "mt-0.5 hidden gap-0.5 border-l border-line pl-2 lg:ml-3 lg:grid")}
          </li>
        ))}
      </ul>
      {visible.includes(section) && pages(section, "-mx-gutter flex gap-1 overflow-x-auto px-gutter text-sm lg:hidden")}
    </nav>
  );
}
