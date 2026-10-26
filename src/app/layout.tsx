import { Suspense } from "react";
import { DiscoveryPreferencesProvider } from "@/components/discovery-preferences-provider";
import { PreparationMigration } from "@/components/preparation-migration";
import type { Metadata, Viewport } from "next";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ProfileProvider } from "@/components/profile-provider";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
export const metadata: Metadata = { title: { default: "CupMaster", template: "%s · CupMaster" }, description: "AI 手沖咖啡教練 PWA" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-Hant"><body><AuthProvider><ProfileProvider><DiscoveryPreferencesProvider><div className="app-shell"><PreparationMigration />{children}<Suspense fallback={null}><BottomNavigation /></Suspense></div></DiscoveryPreferencesProvider></ProfileProvider></AuthProvider></body></html>; }
