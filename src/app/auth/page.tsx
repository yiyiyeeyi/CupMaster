import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "Account" };
export default function AuthPage() { return <Suspense fallback={<main className="route-loading"><p>Preparing account options…</p></main>}><AuthForm /></Suspense>; }
