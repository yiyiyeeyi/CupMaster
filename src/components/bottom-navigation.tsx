"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { getActiveNavigationHref, isBottomNavigationVisible, safePrepareReturnTo } from "@/domain/start-navigation";
import { startCopy as copy } from "./start-copy";
export { getActiveNavigationHref } from "@/domain/start-navigation";
export function BottomNavigation() {
  const pathname = usePathname(), params = useSearchParams();
  if (!isBottomNavigationVisible(pathname, params.toString())) return null;
  const active = getActiveNavigationHref(pathname), returnTo = safePrepareReturnTo(`${pathname}${params.size ? `?${params}` : ""}`);
  const items = [{ href: "/discover", label: "Discover" }, { href: `/brew/prepare?entry=quick&returnTo=${encodeURIComponent(returnTo)}`, label: "＋" }, { href: "/journal", label: "Journal" }, { href: "/me", label: "Me" }];
  return <nav aria-label="Main navigation" className="bottom-nav">{items.map(item => <Link key={item.label} href={item.href} aria-label={item.label === "＋" ? copy.plus : undefined} aria-current={item.href === active ? "page" : undefined} className={item.href === active ? "active" : undefined}>{item.label}</Link>)}</nav>;
}
