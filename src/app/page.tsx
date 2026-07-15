import Link from "next/link";

export default function Home() {
  return (
    <main className="hero">
      <p className="eyebrow">CupMaster</p>
      <h1>Every brewer becomes a master, one cup at a time.</h1>
      <p>最快開始一杯，跟著引導完成沖煮，再慢慢改善下一杯。</p>
      <div className="actions">
        <Link className="primary-button" href="/onboarding">開始設定</Link>
        <Link className="text-link" href="/discover">先探索配方</Link>
      </div>
    </main>
  );
}
