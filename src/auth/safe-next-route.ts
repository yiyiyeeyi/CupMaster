export function getSafeNextRoute(value: string | null | undefined, fallback = "/me") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try { const url = new URL(value, "https://cupmaster.local"); return url.origin === "https://cupmaster.local" ? `${url.pathname}${url.search}${url.hash}` : fallback; } catch { return fallback; }
}
