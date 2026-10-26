"use client";
import { useState } from "react";
import type { UserNeed } from "@/domain/types";
import { experienceLevelSchema, userNeedSchema } from "@/domain/schemas";
import { useDiscoveryPreferences } from "./discovery-preferences-provider";
import { startCopy as copy } from "./start-copy";
export function DiscoveryPreferencesCard({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const preferences = useDiscoveryPreferences();
  return <section className="profile-card"><details open={initiallyOpen || undefined}><summary className="secondary-button">{copy.preferences}</summary><p>{copy.preferenceHint}</p>
    {preferences.ready ? <Fields key={JSON.stringify(preferences.value)} /> : <p role="status">{copy.loading}</p>}
  </details>{preferences.notice && <p className="notice" role="status">{preferences.notice}</p>}</section>;
}
function Fields() {
  const preferences = useDiscoveryPreferences();
  const [experience, setExperience] = useState(preferences.value.experienceLevel), [needs, setNeeds] = useState<UserNeed[]>(preferences.value.selectedNeeds);
  return <form className="form-stack" onSubmit={event => { event.preventDefault(); preferences.save({ experienceLevel: experience, selectedNeeds: needs }); }}>
    <label className="prepare-field">{copy.experience}<select value={experience ?? ""} onChange={event => { const parsed = experienceLevelSchema.safeParse(event.target.value); setExperience(parsed.success ? parsed.data : null); }}>
      <option value="">{copy.unset}</option>{experienceLevelSchema.options.map(value => <option value={value} key={value}>{copy[value]}</option>)}
    </select></label>
    <fieldset><legend>{copy.needs}</legend><div className="choice-list">{userNeedSchema.options.map(value => <label className="choice" key={value}><input type="checkbox" checked={needs.includes(value)} onChange={() => setNeeds(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])} /><span>{copy[value]}</span></label>)}</div></fieldset>
    <button className="secondary-button" type="submit">{copy.save}</button>
  </form>;
}
