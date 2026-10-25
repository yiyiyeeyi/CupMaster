import type { Metadata } from "next";
import { MigrationReviewPage } from "@/components/migration-review";
import "./migration.css";
export const metadata: Metadata = { title: "Migration Review" };
export default function MigrationPage() { return <><p className="notice">新準備紀錄與建議資料目前保留本機；REQ-37b 完成前不寫入雲端新表，也不宣稱這些資料已同步。</p><MigrationReviewPage /></>; }
