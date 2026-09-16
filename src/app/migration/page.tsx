import type { Metadata } from "next";
import { MigrationReviewPage } from "@/components/migration-review";
import "./migration.css";
export const metadata: Metadata = { title: "Migration Review" };
export default function MigrationPage() { return <MigrationReviewPage />; }
