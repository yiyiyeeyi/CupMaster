import type { Brew } from "./types";

/** Compatibility conversion: the detailed feedback wins over a legacy quick rating. */
export function normalizeBrewRecord(brew: Brew): Brew {
  const value = { ...brew };
  const rating = value.quickRating;
  delete value.quickRating;
  if (value.executionStatus === "completed" && value.recordStatus === "draft") value.recordStatus = "saved";
  if (!value.flavorFeedback && rating && rating !== "skipped") {
    const at = value.completedAt ?? value.updatedAt;
    value.flavorFeedback = { id: `impression:${value.id}`, brewId: value.id, overallImpression: rating,
      flavorNotes: [], createdAt: at, updatedAt: at };
  }
  if (value.executionStatus === "completed" && value.feedbackStatus === "not_requested") value.feedbackStatus = "awaiting_feedback";
  if (!value.flavorFeedback && rating === "skipped") value.feedbackStatus = "skipped";
  return value;
}
