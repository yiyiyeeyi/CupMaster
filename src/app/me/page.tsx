import type { Metadata } from "next";
import { ProfileSummary } from "@/components/profile-summary";
export const metadata: Metadata = { title: "Me" };
export default function MePage() { return <ProfileSummary />; }
