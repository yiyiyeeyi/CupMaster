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
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-Hant"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Inter:wght@300;400;500&family=Noto+Sans+TC:wght@300;400;500&family=Noto+Serif+TC:wght@400;500&display=swap" /></head><body><AuthProvider><ProfileProvider><DiscoveryPreferencesProvider><div className="app-shell"><PreparationMigration />{children}<Suspense fallback={null}><BottomNavigation /></Suspense></div></DiscoveryPreferencesProvider></ProfileProvider></AuthProvider></body></html>; }
