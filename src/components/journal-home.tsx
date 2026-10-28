"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrewJournalRow } from "./brew-journal-row";
import { groupJournal, journalDateKey, journalFilter, type JournalFilter, type JournalItem } from "@/domain/journal";
import type { SavedBrewPreparation } from "@/domain/brew-preparation";
import { JournalService } from "@/application/journal-service";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { journalCopy as copy } from "./journal-copy";
import "./journal-v17.css";
import styles from "./brew-return-dialog.module.css";

export function JournalHome() {
  const router = useRouter(), search = useSearchParams(), filter = journalFilter(search.get("filter"));
  const [service] = useState(() => new JournalService(new LocalBrewRepository(), new LocalBrewPreparationRepository()));
  const [data, setData] = useState<ReturnType<JournalService["load"]> | null>(null);
  const [deleting, setDeleting] = useState<SavedBrewPreparation | null>(null), [deleteError, setDeleteError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const dialog = useRef<HTMLDialogElement>(null), deleteButton = useRef<HTMLButtonElement | null>(null);
  function reload() { setData(service.load()); setNow(new Date()); }
  useEffect(() => {
    function refresh() { if (document.visibilityState === "visible") { setData(service.load()); setNow(new Date()); } }
    const timer = window.setTimeout(refresh, 0), midnight = window.setInterval(() => setNow(new Date()), 30_000);
    document.addEventListener("visibilitychange", refresh); window.addEventListener("pageshow", refresh); window.addEventListener("storage", refresh);
    return () => { window.clearTimeout(timer); window.clearInterval(midnight); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("pageshow", refresh); window.removeEventListener("storage", refresh); };
  }, [service]);
  useEffect(() => { if (deleting) dialog.current?.showModal(); else dialog.current?.close(); }, [deleting]);
  function closeDialog() { setDeleting(null); setDeleteError(null); deleteButton.current?.focus(); }
  function remove() {
    if (!deleting) return;
    const result = service.remove(deleting.id);
    if (!result.ok) { setDeleteError(result.message); return; }
    closeDialog(); reload();
  }
  function choose(value: JournalFilter) {
    const params = new URLSearchParams(search.toString());
    if (value === "all") params.delete("filter"); else params.set("filter", value);
    router.replace(`/journal${params.size ? `?${params}` : ""}`, { scroll: false });
  }
  function dateLabel(date: string) {
    if (date === journalDateKey(now)) return copy.today;
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    return date === journalDateKey(yesterday) ? copy.yesterday : date.replaceAll("-", "/");
  }
  const groups = data ? groupJournal(data.brews, data.preparations, filter) : [];
  function card(item: JournalItem) {
    if (item.kind === "preparations") {
      const entry = item.preparation, href = `/brew/prepare?preparationId=${encodeURIComponent(entry.id)}`;
      return <article className="journal-card" key={entry.id}><div>
        <span className="status-line">{copy.preparations}</span><h3>{entry.snapshot.bean?.name ?? copy.noBean} / {entry.snapshot.title}</h3>
        {entry.appliedAdjustment && <p className="journal-adjustment">{copy.applied}：{entry.appliedAdjustment.adjustment.description}</p>}
        <p>{copy.savedDate}：{new Date(entry.updatedAt).toLocaleString("zh-TW")}</p>
        <dl><div><dt>{copy.time}</dt><dd>{`${Math.floor(entry.snapshot.expectedTimeSeconds.value / 60)}:${String(entry.snapshot.expectedTimeSeconds.value % 60).padStart(2,"0")}`}</dd></div><div><dt>{copy.dose}</dt><dd>{entry.snapshot.doseGrams.value}g</dd></div><div><dt>{copy.water}</dt><dd>{entry.snapshot.totalWaterGrams.value}g</dd></div></dl>
        <div className={styles.actions}><Link className="primary-button" href={href}>{copy.start}</Link><Link className="secondary-button" href={href}>{copy.edit}</Link>
          <button className="secondary-button" type="button" onClick={event => { deleteButton.current = event.currentTarget; setDeleting(entry); setDeleteError(null); }}>{copy.remove}</button></div>
      </div></article>;
    }
    const brew = item.brew;
    return <BrewJournalRow key={brew.id} brew={brew}/>;

  }
  const failed = !!data && (filter !== "preparations" && !!data.brewError || filter !== "completed" && !!data.preparationError);
  return <main className="journal-page"><header><p className="eyebrow">BREW JOURNAL</p><h1>Journal</h1><p>{copy.description}</p></header>
    <p className="notice">{copy.localNotice}</p>
    <nav className="section-heading" aria-label={copy.filters}>{(["all", "completed", "preparations"] as const).map(value => <button className="secondary-button" type="button" key={value} aria-pressed={filter === value} onClick={() => choose(value)}>{copy[value]}</button>)}</nav>
    {data?.brewError && <p role="alert">{data.brewError}<button type="button" onClick={reload}>{copy.retry}</button></p>}
    {data?.preparationError && <p role="alert">{data.preparationError}<button type="button" onClick={reload}>{copy.retry}</button></p>}
    {!!data?.warnings.length && <p className="notice" role="status">{copy.conversionWarning} {data.warnings.length} {copy.warningCount}</p>}
    {!data ? <p role="status">{copy.loading}</p> : groups.length === 0 ? !failed && <section className="empty-state"><h2>{filter === "completed" ? copy.emptyCompleted : filter === "preparations" ? copy.emptyPreparations : copy.emptyAll}</h2>{filter === "preparations" && <p>{copy.saveHint}</p>}<Link className="primary-button" href="/discover">{copy.chooseRecipe}</Link></section> :
      groups.map(group => <section className="journal-section" key={`${group.kind}:${group.date}`}><div className="section-heading"><h2>{copy[group.kind]} · {dateLabel(group.date)}</h2><span>{group.items.length}</span></div><div className="journal-list">{group.items.map(card)}</div></section>)}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="preparation-delete-question" onCancel={closeDialog}>
      <p id="preparation-delete-question">{copy.deleteQuestion}</p>{deleting && <p>{deleting.snapshot.title}</p>}{deleteError && <p role="alert">{deleteError}</p>}
      <div className={styles.actions}><button className="secondary-button" type="button" onClick={closeDialog}>{copy.cancel}</button><button className="primary-button" type="button" onClick={remove}>{copy.remove}</button></div>
    </dialog>
  </main>;
}
