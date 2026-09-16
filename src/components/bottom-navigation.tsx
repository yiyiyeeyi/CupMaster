"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const items = [
  { href: "/discover", label: "Discover", active: (path: string) => path === "/discover" || (path.startsWith("/recipes/") && !path.endsWith("/prepare")) },
  { href: "/brew", label: "Brew", active: (path: string) => path === "/brew" || path.startsWith("/brew/") || path.endsWith("/prepare") },
  { href: "/journal", label: "Journal", active: (path: string) => path === "/journal" || path.startsWith("/journal/") || path === "/plans" || path.startsWith("/plans/") },
] as const;
export function getActiveNavigationHref(pathname: string) { return items.find((item) => item.active(pathname))?.href ?? null; }
export function BottomNavigation() { const pathname = usePathname(); if (pathname === "/" || pathname.startsWith("/onboarding") || pathname.startsWith("/auth") || pathname.startsWith("/dev/")) return null; const activeHref = getActiveNavigationHref(pathname); return <nav aria-label="Main navigation" className="bottom-nav">{items.map((item) => <Link aria-current={item.href === activeHref ? "page" : undefined} className={item.href === activeHref ? "active" : undefined} href={item.href} key={item.href}>{item.label}</Link>)}</nav>; }
