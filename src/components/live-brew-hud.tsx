import type { ReactNode } from "react";
import { brewSheetCopy as copy } from "./brew-sheet-copy";
import "./live-brew-hud.css";

export function LiveBrewHud({ title, stage, target, instruction, elapsed, expected, drain = false, progress, next, actions, back, settings }: {
  title: string; stage: string; target?: number; instruction: string; elapsed: ReactNode; expected: string; drain?: boolean;
  progress: Array<{ id: string; name: string; current: boolean; completed: boolean; duration?: number; fraction?: number }>; next?: string; actions: ReactNode; back: ReactNode; settings?: ReactNode;
}) {
  return <section className="live-hud" aria-label="Live Brew"><header>{back}<div><h1>{title}</h1><div className="live-hud-clock">{copy.elapsed} {elapsed} / {expected}</div></div>{settings ?? <span />}</header><div className="live-hud-focus"><p key={stage} className="live-hud-stage">{stage}</p>{drain ? <h2 className="live-hud-drain">{copy.drain}</h2> : target !== undefined ? <p className="live-hud-target">{target}<small>g</small></p> : null}<p className="live-hud-instruction">{instruction}</p><p className="live-hud-caption">{drain ? copy.drainAction : copy.target}</p><ol aria-label="沖煮階段" className="live-hud-progress">{progress.map(step => <li key={step.id} className={step.completed ? "complete" : step.current ? "current" : ""} aria-label={step.name} aria-current={step.current ? "step" : undefined} style={{flexGrow:step.duration ?? 0,flexBasis:step.duration ? 0 : 12}}><span style={{width:`${(step.completed ? 1 : step.fraction ?? 0)*100}%`}} /></li>)}</ol>{next && <p className="live-hud-next">{copy.next}　{next}</p>}<div className="live-hud-controls">{actions}</div></div></section>;
}
