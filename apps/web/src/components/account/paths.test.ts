import { describe, expect, it } from "vite-plus/test";
import { accountPaths } from "./paths";

describe("accountPaths", () => {
  const { sections, subpages } = accountPaths("/en/account/");

  it("puts the profile at the account's address and each section under it", () => {
    expect(sections.profile).toBe("/en/account/");
    expect(sections.content).toBe("/en/account/content/");
  });

  it("puts a section's first page at the section's address and the rest under it", () => {
    expect(subpages.texts).toBe("/en/account/content/");
    expect(subpages.indicators).toBe("/en/account/content/indicators/");
    expect(subpages.users).toBe("/en/account/admin/");
    expect(subpages.audit).toBe("/en/account/admin/audit/");
  });
});
