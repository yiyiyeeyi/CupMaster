"use client";

import type { Brew, FlavorOverallImpression } from "@/domain";
import { calculateNumericDifference, formatDuration, formatSignedDuration, formatSignedNumber } from "@/domain";
import { brewRecordCopy as copy } from "./brew-record-copy";

export function BrewResultSummary({ brew, justCompleted, onImpression }: {
  brew: Brew; justCompleted: boolean; onImpression: (value: FlavorOverallImpression) => void;
}) {
  const snapshot = brew.recipeSnapshot, details = brew.recordDetails;
  const metric = (label: string, value: number | null, target: number, unit: string) => <div className="summary-row" key={label}>
    <strong>{label}</strong><span>{value === null ? "—" : `${value}${unit}`}</span><span>{target}{unit}</span>
    <span>{formatSignedNumber(calculateNumericDifference(value, target), unit)}</span>
  </div>;
  return <>
    {justCompleted ? <section className="summary-panel" aria-labelledby="just-completed-title">
      <h2 id="just-completed-title">{copy.justCompleted}</h2><p>{copy.savedLocally}</p>
      <div className="summary-table">
        <div className="summary-row header"><span>{copy.metric}</span><span>{copy.actual}</span><span>{copy.target}</span><span>{copy.difference}</span></div>
        {metric(copy.dose, details?.actualDoseGrams ?? null, snapshot.doseGrams.value, "g")}
        {metric(copy.water, details?.actualWaterGrams ?? null, snapshot.totalWaterGrams.value, "g")}
        {metric(copy.temperature, details?.actualTemperatureCelsius ?? null, snapshot.temperatureCelsius.value, "°C")}
        <div className="summary-row"><strong>{copy.totalTime}</strong>
          <span>{brew.actualTotalTimeSeconds === null ? "—" : formatDuration(brew.actualTotalTimeSeconds)}</span>
          <span>{formatDuration(snapshot.expectedTimeSeconds.value)}</span>
          <span>{brew.actualTotalTimeSeconds === null ? "—" : formatSignedDuration(brew.actualTotalTimeSeconds - snapshot.expectedTimeSeconds.value)}</span>
        </div>
      </div><p className="missing-measurements">{copy.missingMeasurements}</p>
    </section> : null}
    <fieldset className="quick-rating"><legend>{copy.quickFeeling} <span>（{copy.optional}）</span></legend><div>
      {(["liked", "neutral", "disliked"] as const).map(value => <label key={value}>
        <input type="radio" name="overall-impression" value={value} checked={brew.flavorFeedback?.overallImpression === value} onChange={() => onImpression(value)} />
        <span>{copy[value]}</span>
      </label>)}
    </div></fieldset>
  </>;
}
