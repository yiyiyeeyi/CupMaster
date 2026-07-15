export type Id = string;
export type ISODateTime = string;
export type DataSource = "recipe_default" | "user_override" | "measured" | "calculated" | "user_reported" | "inferred";
export type UserExperienceLevel = "beginner" | "developing" | "intermediate" | "advanced";
export type UserNeed = "gear_guidance" | "learn_basics" | "improve_consistency" | "find_recipe_for_bean" | "track_and_compare" | "improve_flavor";
export type Method = "pour_over" | "immersion" | "hybrid";
export type RecipeType = "official" | "personal" | "forked" | "suggested_plan";
export type BrewExecutionStatus = "not_started" | "in_progress" | "paused" | "completed" | "abandoned";
export type BrewRecordStatus = "draft" | "saved" | "archived";
export type BrewFeedbackStatus = "not_requested" | "awaiting_feedback" | "completed" | "skipped";
export type BrewAnalysisStatus = "not_requested" | "ready" | "processing" | "completed" | "failed";
export type BrewQuickRating = "poor" | "fair" | "good" | "excellent";

export interface SourcedValue<T> { value: T; source: DataSource; }
export interface UserProfile { id: Id; displayName: string; experienceLevel: UserExperienceLevel; currentNeeds: UserNeed[]; createdAt: ISODateTime; updatedAt: ISODateTime; }
export interface Equipment { id: Id; category: "dripper" | "grinder" | "kettle" | "scale" | "server" | "other"; name: string; brand?: string; model?: string; notes?: string; }
export interface GearGuideItem { id: Id; category: Equipment["category"]; title: string; summary: string; experienceLevels: UserExperienceLevel[]; selectionCriteria: string[]; }
export interface Bean { id: Id; name: string; roaster?: string; origin?: string; process?: string; roastLevel?: "light" | "medium_light" | "medium" | "medium_dark" | "dark"; notes?: string; }
export interface RecipeStep { id: Id; order: number; title: string; targetWaterGrams: number; durationSeconds?: number; pattern?: "center" | "spiral" | "pulse" | "continuous" | "immersion"; instruction: string; }
export interface RecipeVersion { id: Id; recipeId: Id; version: number; title: string; method: Method; author: string; doseGrams: number; totalWaterGrams: number; temperatureCelsius: number; grindDescription: string; dripper: string; expectedTimeSeconds: number; steps: RecipeStep[]; createdAt: ISODateTime; }
export interface Recipe { id: Id; type: RecipeType; currentVersion: RecipeVersion; parentRecipeId?: Id; publishedAt?: ISODateTime; }

export interface QuickPrepareInput { recipeVersionId: Id; doseGrams?: number; totalWaterGrams?: number; temperatureCelsius?: number; dripper?: string; grindSetting?: string; beanId?: Id; equipmentNotes?: string; }
export interface BrewPlan { id: Id; createdAt: ISODateTime; recipeSnapshot: BrewRecipeSnapshot; stages: BrewStage[]; }
export interface BrewStage { id: Id; order: number; title: string; targetWaterGrams: number; targetDurationSeconds?: number; pattern?: RecipeStep["pattern"]; instruction: string; }
export interface BrewStageResult { stageId: Id; startedAt?: ISODateTime; completedAt?: ISODateTime; actualWaterGrams?: SourcedValue<number>; actualDurationSeconds?: SourcedValue<number>; notes?: string; }

export interface BrewRecipeSnapshot {
  sourceRecipeId?: Id;
  sourceRecipeVersion?: number;
  title: string;
  method: Method;
  author: string;
  doseGrams: SourcedValue<number>;
  totalWaterGrams: SourcedValue<number>;
  temperatureCelsius: SourcedValue<number>;
  grindDescription: SourcedValue<string>;
  dripper: SourcedValue<string>;
  expectedTimeSeconds: SourcedValue<number>;
  steps: RecipeStep[];
  userOverrides: Partial<Record<"doseGrams" | "totalWaterGrams" | "temperatureCelsius" | "grindDescription" | "dripper", string | number>>;
  bean?: { id: Id; name: string };
  equipment?: { equipmentId?: Id; dripper: string; grinder?: string; notes?: string };
}

export interface Brew { id: Id; userId: Id; plan: BrewPlan; recipeSnapshot: BrewRecipeSnapshot; executionStatus: BrewExecutionStatus; recordStatus: BrewRecordStatus; feedbackStatus: BrewFeedbackStatus; analysisStatus: BrewAnalysisStatus; stageResults: BrewStageResult[]; quickRating?: BrewQuickRating; startedAt?: ISODateTime; completedAt?: ISODateTime; savedAt?: ISODateTime; }
export interface FlavorFeedback { brewId: Id; rating?: BrewQuickRating; acidity?: number; sweetness?: number; bitterness?: number; body?: number; notes?: string; submittedAt: ISODateTime; }
export interface InsightEvidence { source: "brew_parameter" | "stage_result" | "flavor_feedback" | "user_note"; reference: string; value: string | number | boolean; }
export interface Insight { id: Id; observation: string; possibleImpact: string; confidence: "low" | "medium" | "high"; evidence: InsightEvidence[]; }
export interface SuggestedPlanChange { variable: "dose" | "water" | "temperature" | "grind" | "pour" | "time"; from?: string | number; to: string | number; reason: string; }
export interface SuggestedPlan { id: Id; sourceBrewId: Id; title: string; primaryChange: SuggestedPlanChange; keepUnchanged: string[]; createdAt: ISODateTime; }
export interface CollectionItem { id: Id; userId: Id; itemType: "recipe" | "bean" | "suggested_plan"; itemId: Id; list: "saved" | "want_to_try"; savedAt: ISODateTime; }
