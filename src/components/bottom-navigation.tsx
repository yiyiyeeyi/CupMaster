import Link from "next/link";

const items = [
  { href: "/discover", label: "Discover" },
  { href: "/brew", label: "Brew" },
  { href: "/journal", label: "Journal" },
  { href: "/me", label: "Me" },
] as const;

export function BottomNavigation() {
  return <nav aria-label="主要導航" className="bottom-nav">{items.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}</nav>;
}
