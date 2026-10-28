"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { getActiveNavigationHref, isBottomNavigationVisible, safePrepareReturnTo } from "@/domain/start-navigation";
import { startCopy as copy } from "./start-copy";
export { getActiveNavigationHref } from "@/domain/start-navigation";

const icons = {
  discover: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  collection: <><path d="M6 4h12l1 16H5z"/><path d="M8 9h8M9 13h6"/></>,
  brew: <><path d="M5 6h14l-5 7h-4z" /><path d="M9 16h6l-1 4h-4z" /></>,
  journal: <><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  me: <><circle cx="12" cy="9" r="3.5" /><path d="M5 20c1.5-4 12.5-4 14 0" /></>,
};
function Icon({ name }: { name: keyof typeof icons }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{icons[name]}</svg>;
}
export function BottomNavigation() {
  const pathname = usePathname(), params = useSearchParams();
  if (!isBottomNavigationVisible(pathname, params.toString())) return null;
  const active = getActiveNavigationHref(pathname), returnTo = safePrepareReturnTo(`${pathname}${params.size ? `?${params}` : ""}`);
  const items = [
    { href: "/discover", label: "Discover", icon: "discover" },
    { href: "/collection", label: "Collection", icon: "collection" },
    { href: `/brew/prepare?entry=quick&returnTo=${encodeURIComponent(returnTo)}`, label: "Brew", icon: "brew", brew: true },
    { href: "/journal", label: "Journal", icon: "journal" },
    { href: "/me", label: "Me", icon: "me" },
  ] as const;
  return <nav aria-label="Main navigation" className="bottom-nav">{items.map(item => {
    const current = item.href === active, brew = "brew" in item;
    return <Link key={item.label} href={item.href} aria-label={brew ? copy.plus : undefined} aria-current={current ? "page" : undefined} className={[current && "active", brew && "bottom-nav-brew"].filter(Boolean).join(" ") || undefined}>
      {brew ? <span className="bottom-nav-brew-mark"><Icon name={item.icon} /></span> : <Icon name={item.icon} />}{item.label}
    </Link>;
  })}</nav>;
}
