/** The account's sections, in the order the panel lists them. */
export const accountSections = ["profile", "zones", "projects", "invitations", "content", "admin"] as const;
export type AccountSection = (typeof accountSections)[number];

/** The pages a section holds, the first at the section's own address. */
export const accountSubpages = {
  content: ["texts", "articles", "indicators"],
  admin: ["users", "audit"],
} as const satisfies Partial<Record<AccountSection, readonly string[]>>;
export type SectionWithPages = keyof typeof accountSubpages;
export type AccountSubpage = (typeof accountSubpages)[SectionWithPages][number];

export const hasPages = (section: AccountSection): section is SectionWithPages => section in accountSubpages;

/** Where each section and each of their pages live, under the account's address. */
export function accountPaths(account: string) {
  const sections = Object.fromEntries(
    accountSections.map((s) => [s, s === "profile" ? account : `${account}${s}/`]),
  ) as Record<AccountSection, string>;
  const subpages = Object.fromEntries(
    Object.entries(accountSubpages).flatMap(([s, pages]) =>
      pages.map((page, i) => [
        page,
        i === 0 ? sections[s as SectionWithPages] : `${sections[s as SectionWithPages]}${page}/`,
      ]),
    ),
  ) as Record<AccountSubpage, string>;
  return { sections, subpages };
}
