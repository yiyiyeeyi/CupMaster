import { redirect } from "next/navigation";
import { legacyStartRedirect, type StartQuery } from "@/domain/start-navigation";
export default async function BrewPage({ searchParams }: { searchParams: Promise<StartQuery> }) { redirect(legacyStartRedirect("/brew/prepare", await searchParams)); }
