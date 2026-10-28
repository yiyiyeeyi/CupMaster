import type { BrewRepository } from "@/repositories/brew-repository";
import {LocalBeanRepository} from "@/repositories/local-bean-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { consumeCompletedPreparation } from "./preparation-completion";

export class JournalService {
  constructor(private readonly brews: BrewRepository, private readonly preparations: LocalBrewPreparationRepository,private readonly beans=new LocalBeanRepository()) {}
  load() {
    const migration = this.preparations.migrate();
    const brews = this.brews.listJournalEntries();
    let cleanupError: string | null = null;
    if (migration.ok && brews.ok) for (const brew of brews.value) {
      const result = consumeCompletedPreparation(brew, this.preparations);
      if (!result.ok) cleanupError = "已保存沖煮，待移除的準備紀錄尚未整理完成，請重試。";
    }
    const preparations = this.preparations.read();
    const beans=this.beans.read();
    return { brews: brews.value, beans:beans.ok?beans.value.beans:[],brewNotice:brews.ok?brews.notice:undefined, preparations: preparations.ok ? preparations.value.entries : [],
      warnings: preparations.ok ? preparations.value.warnings : [],
      brewError: brews.ok ? null : brews.message,
      preparationError: !migration.ok ? migration.message : !preparations.ok ? preparations.message : cleanupError };
  }
  remove(id: string) {
    const migration = this.preparations.migrate(); if (!migration.ok) return migration;
    return this.preparations.remove(id);
  }
}
