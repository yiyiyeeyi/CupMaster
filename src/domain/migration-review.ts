import type { MigrationGraphError } from "./cloud-migration";

export interface MigrationReviewSummary {
  profile: number;
  recipes: number;
  brews: number;
  suggestedPlans: number;
}

export type MigrationReviewWarningCode =
  | "profile_missing"
  | "profile_unavailable"
  | "recipes_unavailable"
  | "brews_unavailable"
  | "plans_unavailable"
  | "legacy_data"
  | MigrationGraphError["code"];

export interface MigrationReviewWarning {
  code: MigrationReviewWarningCode;
  entityId: string | null;
  title: string;
  message: string;
}

export interface MigrationReviewValidationResult {
  valid: boolean;
  errors: MigrationGraphError[];
}

export interface MigrationReview {
  summary: MigrationReviewSummary;
  warnings: MigrationReviewWarning[];
  validation: MigrationReviewValidationResult;
  consentGiven: boolean;
  phase: "review" | "ready";
  reviewFingerprint: string;
}

export function createMigrationReviewConsentState(consentGiven = false): Pick<MigrationReview, "consentGiven" | "phase"> {
  return { consentGiven, phase: "review" };
}

export function setMigrationReviewConsent(state: Pick<MigrationReview, "consentGiven" | "phase">, consentGiven: boolean) {
  return { ...state, consentGiven };
}

export function continueMigrationReview(state: Pick<MigrationReview, "consentGiven" | "phase">) {
  return state.consentGiven ? { ...state, phase: "ready" as const } : state;
}
