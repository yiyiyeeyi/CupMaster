import type { AuthState } from "./auth-types";
export function getMeAuthViewModel(state: AuthState) { return state.status === "authenticated" ? { heading: "Cloud account connected", action: "Sign out", syncEnabled: false } as const : { heading: "Local Mode", action: "Sign in for future cloud sync", syncEnabled: false } as const; }
export const authPageLayoutContract = { maxWidthRem: 32, mobileWidthPx: 390, allowsHorizontalOverflow: false } as const;
export function isLocalRoute(pathname: string) { return ["/", "/discover", "/brew", "/journal", "/me", "/auth", "/onboarding"].some((route) => pathname === route || (route !== "/" && pathname.startsWith(`${route}/`))); }
