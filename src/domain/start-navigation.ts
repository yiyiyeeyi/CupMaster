export type StartQuery = Record<string, string | string[] | undefined>;
export function safePrepareReturnTo(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/discover";
  try {
    const url = new URL(value, "https://cupmaster.local");
    return url.origin === "https://cupmaster.local" && (["/discover", "/journal", "/me", "/collection"].includes(url.pathname) || /^\/beans\/[^/]+(?:\/edit)?$/.test(url.pathname))
      ? `${url.pathname}${url.search}${url.hash}` : "/discover";
  } catch { return "/discover"; }
}
export function legacyStartRedirect(path: "/discover" | "/brew/prepare", query: StartQuery, forced: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
    params.append(key, key === "returnTo" ? safePrepareReturnTo(item) : item);
  }
  for (const [key, value] of Object.entries(forced)) if (!params.has(key)) params.set(key, value);
  return `${path}${params.size ? `?${params}` : ""}`;
}
export function isBottomNavigationVisible(path: string, query = "") {
  if (path === "/" || /^\/(brew|auth|onboarding|dev)(\/|$)/.test(path) || /^\/recipes\/[^/]+\/prepare\/?$/.test(path) || /\/complete\/?$/.test(path)) return false;
  return !(/^\/journal\/[^/]+\/?$/.test(path) && new URLSearchParams(query).get("justCompleted") === "1");
}
export function getActiveNavigationHref(path: string) {
  if (path === "/discover" || path.startsWith("/recipes/")) return "/discover";
  if (path === "/journal" || path.startsWith("/journal/") || path === "/plans" || path.startsWith("/plans/")) return "/journal";
  if (path === "/collection" || path.startsWith("/beans/")) return "/collection";
  if (path === "/me" || path.startsWith("/me/")) return "/me";
  return null;
}
