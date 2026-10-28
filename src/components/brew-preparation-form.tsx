"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalBeanRepository } from "@/repositories/local-bean-repository";
import { selectPreparationBean } from "@/application/bean-service";
import { PreparationControls } from "./preparation-controls";
import { prepareCopy } from "./prepare-copy";
import { cancelBrewAdjustment } from "@/domain/brew-preparation";
import { beginnerRecipe, loadQuickPreparation, preparationFromRecipe, switchPreparationRecipe, type PreparationSeed } from "@/application/quick-preparation";
import { safePrepareReturnTo } from "@/domain/start-navigation";
import { startCopy } from "./start-copy";
import { BrewPreparationService } from "@/application/brew-preparation-service";
import { LocalBrewRepository } from "@/repositories/local-brew-repository";
import { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { preparationCopy as copy } from "./brew-preparation-copy";
import type { Recipe } from "@/domain";
const emptyRecipes: Recipe[] = [];

export function BrewPreparationForm({ beanId, sourceBrewId, recommendationId, preparationId, recipe, recipes = emptyRecipes, quick = false, returnTo }: { beanId?:string; sourceBrewId?: string; recommendationId?: string; preparationId?: string; recipe?: Recipe; recipes?: Recipe[]; quick?: boolean; returnTo?: string }) {
  const router = useRouter(), lock = useRef(false);
  const [seed, setSeed] = useState<PreparationSeed | null>(null), [error, setError] = useState<string | null>(null), [outdated, setOutdated] = useState(false);
  const [notice, setNotice] = useState<string | null>(null), [switched, setSwitched] = useState(false);
  const [service] = useState(() => new BrewPreparationService(new LocalBrewRepository(), new LocalBrewPreparationRepository()));
  const savedId = useRef<string | null>(preparationId ?? null);
  useEffect(() => { const timer = window.setTimeout(() => {
    savedId.current = preparationId ?? null;
    setError(null); setNotice(null); setSwitched(false); setOutdated(false);
    const withBean=(value:PreparationSeed)=>{if(!beanId)return value;const beans=new LocalBeanRepository().read();const bean=beans.ok?beans.value.beans.find(bean=>bean.id===beanId && !bean.deletedAt):null;if(!bean){setNotice("這包豆子目前無法選取，仍可直接沖煮。");return value;}return selectPreparationBean(value,bean);};
    if (recipe) { setSeed(withBean(preparationFromRecipe(recipe))); return; }
    if (quick) { const result = loadQuickPreparation(new LocalBrewRepository(), recipes); if (result.ok) { setSeed(withBean(result.value)); if(result.notice)setNotice(result.notice); } else { setSeed(null); setError(result.message); } return; }
    const result = service.load({ sourceBrewId, recommendationId, preparationId });
    if (result.ok) { setSeed(withBean({ ...result.value, ...(preparationId && { sourcePreparationId: preparationId }) })); setOutdated(result.outdated); } else { setSeed(null); setError(result.message); }
  }, 0); return () => window.clearTimeout(timer); }, [beanId, sourceBrewId, recommendationId, preparationId, service, recipe, recipes, quick]);
  function start(saveOnly = false) {
    if (!seed || lock.current) return; lock.current = true;
    if (saveOnly) {
      const id = savedId.current ?? crypto.randomUUID(); savedId.current = id;
      const result = new LocalBrewPreparationRepository().save(seed, id, new Date().toISOString());
      if (result.ok) { router.push("/journal"); return; } else setError(result.message);
    } else { const result = service.create(seed, seed.sourcePreparationId); if (result.ok) { router.push(`/brew/${result.value.id}`); return; } else setError(result.message); }
    lock.current = false;
  }
  const back = returnTo ? safePrepareReturnTo(returnTo) : quick ? "/discover" : recipe ? `/recipes/${recipe.id}` : sourceBrewId ? `/journal/${sourceBrewId}${recommendationId ? "/analysis" : ""}` : "/journal";
  if (!seed) return <main className="state-page"><h1>Quick Prepare</h1><p role="status">{error ?? copy.loading}</p>{quick && error && beginnerRecipe(recipes) && <button type="button" className="secondary-button" onClick={() => { const fallback = beginnerRecipe(recipes); if (fallback) { setSeed(preparationFromRecipe(fallback)); setNotice(error); setError(null); } }}>{startCopy.useBeginner}</button>}<Link href={back}>←</Link></main>;
  return <main className="prepare-page"><div className="prepare-topbar"><Link href={back}>←</Link><div><p className="eyebrow">{prepareCopy.kicker}</p><h1>{prepareCopy.title}</h1></div><span /></div>
    <p>{switched ? startCopy.switched : startCopy.switchHint}</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    {outdated && <p className="notice">{copy.outdated}</p>}
    {error && <p role="alert">{error}</p>}
    <form onSubmit={event=>{event.preventDefault();start();}}>
      <PreparationControls key={seed.plan.sourceRecipeId+":"+seed.snapshot.sourceRecipeVersion} seed={seed} onChange={setSeed} recipes={recipes.length?recipes:recipe?[recipe]:[]} onRecipe={selected=>{setSeed(switchPreparationRecipe(seed,selected));setSwitched(true);setOutdated(false);setError(null);}} />
      {seed.appliedAdjustment && <aside className="prepare-note"><strong>{copy.applied}</strong><p>{seed.appliedAdjustment.adjustment.description}</p><button className="secondary-button" type="button" onClick={()=>setSeed(cancelBrewAdjustment(seed))}>{copy.cancel}</button></aside>}
      {switched && preparationId && <p className="notice" role="status">{startCopy.updatePreparation}</p>}
      <div className="prepare-submit"><button className="secondary-button" type="button" onClick={()=>start(true)}>{prepareCopy.saveLater}</button><button className="primary-button" type="submit">{copy.start}</button></div>
    </form>
  </main>;
}
