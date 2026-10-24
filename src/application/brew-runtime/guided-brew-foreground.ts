import type { BrewInterruptionService } from "../brew-interruption-service";
import type { GuidedBrewV1Session } from "./guided-brew-v1-session";

/** Storage inspection must not suspend the still-mounted in-memory runtime. */
export function inspectGuidedBrewForeground(
  interruption: Pick<BrewInterruptionService, "inspect">,
  brewId: string,
  session: Pick<GuidedBrewV1Session, "catchUp" | "observeTime">,
  now: number,
) {
  const result = interruption.inspect(brewId);
  if (!result.ok || result.state === "active") session.catchUp(now);
  else if (result.state === "overrun") session.observeTime(now);
  return result;
}
