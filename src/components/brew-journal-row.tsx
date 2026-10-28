import Link from "next/link";
import {formatRatio,type Brew} from "@/domain";
import {journalCopy as copy} from "./journal-copy";
import "./journal-v17.css";
import {BrewRating} from "./brew-rating";

export function BrewJournalRow({brew,delta}:{brew:Brew;delta?:number}){
  return <Link className="journal-brew-row" href={`/journal/${encodeURIComponent(brew.id)}`}>
    <span className="journal-bean-tile" aria-hidden="true">♧</span><div><h3>{brew.recordDetails?.bean?.name ?? brew.recipeSnapshot.bean?.name ?? brew.recipeSnapshot.title}</h3><p>{brew.recipeSnapshot.title} · {brew.recordDetails?.equipment?.dripper ?? brew.recipeSnapshot.dripper.value}</p><BrewRating feedback={brew.flavorFeedback} delta={delta}/>{brew.appliedAdjustment && <p className="journal-adjustment">{copy.applied}：{brew.appliedAdjustment.adjustment.description}</p>}</div><div className="journal-ratio"><strong>{formatRatio(brew.recordDetails?.actualDoseGrams ?? brew.recipeSnapshot.doseGrams.value, brew.recordDetails?.actualWaterGrams ?? brew.recipeSnapshot.totalWaterGrams.value)}</strong><small>粉水比</small></div>
  </Link>;
}
