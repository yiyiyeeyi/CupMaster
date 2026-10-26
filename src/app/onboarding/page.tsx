import { redirect } from "next/navigation";
import { legacyStartRedirect, type StartQuery } from "@/domain/start-navigation";
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<StartQuery> }) { redirect(legacyStartRedirect("/discover", await searchParams, { preferences: "edit" })); }
