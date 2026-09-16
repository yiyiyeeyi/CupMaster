import type { Metadata, Viewport } from "next";
import { BottomNavigation } from "@/components/bottom-navigation";
import { ProfileProvider } from "@/components/profile-provider";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
export const metadata: Metadata = { title: { default: "CupMaster", template: "%s · CupMaster" }, description: "AI 手沖咖啡教練 PWA" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-Hant"><body><AuthProvider><ProfileProvider><div className="app-shell">{children}<BottomNavigation /></div></ProfileProvider></AuthProvider></body></html>; }
