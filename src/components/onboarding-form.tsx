"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { experienceLevelSchema, userNeedSchema } from "@/domain";
import type { UserExperienceLevel, UserNeed } from "@/domain";
import { useProfile } from "@/hooks/use-profile";
const experiences: { value: UserExperienceLevel; label: string }[] = [
  { value: "beginner", label: "我剛開始接觸手沖" }, { value: "developing", label: "我已經會沖，但結果不太穩定" },
  { value: "intermediate", label: "我會調整參數，想進一步改善" }, { value: "advanced", label: "我有較多經驗，想記錄與比較不同方案" },
];
const needs: { value: UserNeed; label: string }[] = [
  { value: "gear_guidance", label: "不知道該買哪些器材" }, { value: "learn_basics", label: "想學會基本手沖" },
  { value: "improve_consistency", label: "想讓每次結果更穩定" }, { value: "find_recipe_for_bean", label: "想找適合豆子的 Recipe" },
  { value: "track_and_compare", label: "想記錄和比較每次沖煮" }, { value: "improve_flavor", label: "想改善風味問題" },
];
export const experienceLabels = Object.fromEntries(experiences.map((item) => [item.value, item.label])) as Record<UserExperienceLevel, string>;
export const needLabels = Object.fromEntries(needs.map((item) => [item.value, item.label])) as Record<UserNeed, string>;

export function OnboardingForm() {
  const profileState = useProfile();
  if (profileState.status === "loading") return <main className="route-loading"><p>Loading your profile…</p></main>;
  return <OnboardingFields initialName={profileState.storedProfile?.profile.displayName ?? ""} initialExperience={profileState.storedProfile?.profile.experienceLevel} initialNeeds={profileState.storedProfile?.selectedNeeds ?? []} profileState={profileState} />;
}

function OnboardingFields({ initialName, initialExperience, initialNeeds, profileState }: { initialName: string; initialExperience?: UserExperienceLevel; initialNeeds: UserNeed[]; profileState: ReturnType<typeof useProfile> }) {
  const { storedProfile, notice, completeOnboarding } = profileState; const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1); const [displayName, setDisplayName] = useState(initialName); const [experience, setExperience] = useState<UserExperienceLevel | undefined>(initialExperience);
  const [selectedNeeds, setSelectedNeeds] = useState<UserNeed[]>(initialNeeds); const [error, setError] = useState<string | null>(null); const [submitting, setSubmitting] = useState(false);
  function continueName(event: FormEvent) { event.preventDefault(); const trimmed = displayName.trim(); if (trimmed.length < 2) return setError("Please enter at least 2 characters so we know what to call you."); if (trimmed.length > 40) return setError("Please keep your display name to 40 characters or fewer."); setDisplayName(trimmed); setError(null); setStep(2); }
  function toggleNeed(value: UserNeed) { setSelectedNeeds((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]); }
  function finish(event: FormEvent) { event.preventDefault(); if (submitting) return; const parsedExperience = experienceLevelSchema.safeParse(experience); const parsedNeeds = userNeedSchema.array().safeParse(selectedNeeds); if (!parsedExperience.success) return setError("Choose the experience level that fits you best."); if (!parsedNeeds.success) return setError("One selected need is invalid. Please choose again."); setSubmitting(true); const result = completeOnboarding({ displayName, experienceLevel: parsedExperience.data, selectedNeeds: parsedNeeds.data }); if (!result.ok) setError(`${result.message} You can continue for this session.`); router.replace("/discover"); }
  return <main className="onboarding-page">
    <div className="onboarding-header"><div><p className="eyebrow">CupMaster</p><p className="brand-line">Every brewer becomes a master, one cup at a time.</p></div>{storedProfile?.onboardingCompleted && <Link className="text-link" href="/discover">Back to Discover</Link>}</div>
    {notice && <p className="notice" role="status">{notice}</p>}
    {step === 1 ? <form className="form-stack" onSubmit={continueName} noValidate><p className="step-label">Step 1 of 2</p><h1>What should we call you?</h1><p>Your name or nickname is enough. It does not need to be your real name.</p><label htmlFor="display-name">Display name</label><input autoComplete="nickname" id="display-name" maxLength={41} onChange={(event) => setDisplayName(event.target.value)} value={displayName} />{error && <p className="field-error" role="alert">{error}</p>}<button className="primary-button" type="submit">Continue</button></form>
    : <form className="form-stack" onSubmit={finish}><p className="step-label">Step 2 of 2</p><h1>Your brewing experience</h1><fieldset><legend>Choose one experience level</legend><div className="choice-list">{experiences.map((item) => <label className="choice" key={item.value}><input checked={experience === item.value} name="experience" onChange={() => { setExperience(item.value); setError(null); }} type="radio" value={item.value} /><span>{item.label}</span></label>)}</div></fieldset><fieldset><legend>What would you like help with? <span>(optional)</span></legend><div className="choice-list">{needs.map((item) => <label className="choice" key={item.value}><input checked={selectedNeeds.includes(item.value)} onChange={() => toggleNeed(item.value)} type="checkbox" value={item.value} /><span>{item.label}</span></label>)}</div></fieldset>{error && <p className="field-error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary-button" onClick={() => { setError(null); setStep(1); }} type="button">Back</button><button className="primary-button" disabled={submitting} type="submit">{submitting ? "Saving…" : "Go to Discover"}</button></div></form>}
  </main>;
}
