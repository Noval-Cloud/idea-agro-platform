/** The ways to sign in, in the order the sign-in page offers them. `account.ts` implements each one. */
export const signInProviders = ["google"] as const;
export type SignInProvider = (typeof signInProviders)[number];
