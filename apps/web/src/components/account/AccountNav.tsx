import { useEffect, useState } from "react";
import type { Me } from "@idea-agro/api-client";
import type { Locale } from "@/i18n/core";
import { readHint } from "@/lib/account-hint";
import { cn } from "@/lib/utils";
import { accountSections, createAccountTranslator, type AccountCatalog, type AccountSection } from "./i18n";

type Props = {
  locale: Locale;
  catalog: AccountCatalog;
  section: AccountSection;
  sectionPaths: Record<AccountSection, string>;
};

/** The role a section needs, when it needs one. */
export const sectionRoles: Partial<Record<AccountSection, Me["roles"][number]>> = { content: "editor", admin: "admin" };

/**
 * The account's navigation, on every page of the account: a column beside the content on wide screens, a row
 * of tabs above it on phones. Sections that need a role appear for those who have it.
 */
export default function AccountNav({ locale, catalog, section, sectionPaths }: Props) {
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
    const role = sectionRoles[s];
    return !role || roles.includes(role);
  });

  return (
    <nav aria-label={t("account.sections.label")} className="min-w-0">
      <ul className="-mx-gutter flex gap-1 overflow-x-auto px-gutter lg:sticky lg:top-6 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0">
        {visible.map((s) => (
          <li key={s} className="shrink-0">
            <a
              href={sectionPaths[s]}
              aria-current={s === section ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-pill border px-3 text-sm whitespace-nowrap lg:flex lg:h-auto lg:rounded-sm lg:py-2",
                s === section
                  ? "border-ink-subtle bg-surface-sunken text-ink"
                  : "border-transparent text-ink-muted hover:bg-action-soft hover:text-ink",
              )}
            >
              {t(`account.sections.${s}`)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
