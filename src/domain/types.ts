import type { BrewAnalysis, BrewAnalysisAttempt } from "./brew-analysis";

export type Id = string;
export type ISODateTime = string;
export type DataSource = "recipe_default" | "suggested_plan" | "user_override" | "measured" | "calculated" | "user_reported" | "inferred";
export type BrewDraftSource = "recipe" | "suggested_plan" | "previous_brew" | "manual";
export type SuggestedPlanUserDecision = "pending" | "accepted" | "overridden";
export type UserExperienceLevel = "beginner" | "developing" | "intermediate" | "advanced";
export type UserNeed = "gear_guidance" | "learn_basics" | "improve_consistency" | "find_recipe_for_bean" | "track_and_compare" | "improve_flavor";
export type Method = "pour_over" | "immersion" | "hybrid";
export type RecipeType = "official" | "personal" | "forked" | "suggested_plan";
export type RecipeDifficulty = "beginner" | "easy" | "intermediate" | "advanced";
export type RoastSuitability = "light" | "medium_light" | "medium" | "medium_dark" | "dark";
export type BrewExecutionStatus = "not_started" | "in_progress" | "paused" | "completed" | "abandoned";
export type BrewRecordStatus = "draft" | "saved" | "archived";
export type BrewFeedbackStatus = "not_requested" | "awaiting_feedback" | "completed" | "skipped";
export type BrewAnalysisStatus = "not_requested" | "pending" | "completed" | "failed";
export type BrewQuickRating = "liked" | "neutral" | "disliked" | "skipped";
export type FlavorOverallImpression = "liked" | "neutral" | "disliked";
export type FlavorRating = 1 | 2 | 3 | 4 | 5;
export type FlavorNote = "floral" | "citrus" | "berry" | "stone_fruit" | "tropical" | "nutty" | "chocolate" | "caramel" | "tea_like" | "spicy" | "fermented" | "clean" | "juicy" | "dry" | "bitter" | "sour";

export interface SourcedValue<T> { value: T; source: DataSource; }
export interface ResolvedParameter<T> extends SourcedValue<T> { recipeDefault: T; suggestedPlanValue?: T | null; source: "recipe_default" | "suggested_plan" | "user_override"; }
export interface SuggestedPlanHandoff { suggestedPlanId: Id; adjustmentId: Id; variable: "grind" | "water_temperature" | "target_total_time" | "stage_duration"; originalValue: string | number | null; suggestedValue: string | number | null; unit: string | null; description: string; rationale: string; confidence: "low" | "medium" | "high"; evidence: { field: string; label: string; value: string }[]; userDecision: SuggestedPlanUserDecision; confirmedAt: ISODateTime | null; }
export interface Brew { sourceType?: BrewDraftSource; sourceSuggestedPlanId?: Id; sourceBrewId?: Id; sourceAnalysisId?: Id; sourceRecommendationId?: Id; sourceFingerprint?: string; suggestedPlanHandoff?: SuggestedPlanHandoff | null; }
export interface UserProfile { id: Id; displayName: string; experienceLevel: UserExperienceLevel; currentNeeds: UserNeed[]; createdAt: ISODateTime; updatedAt: ISODateTime; }
export interface Equipment { id: Id; category: "dripper" | "grinder" | "kettle" | "scale" | "server" | "other"; name: string; brand?: string; model?: string; notes?: string; }
export interface GearGuideItem { id: Id; category: Equipment["category"]; title: string; summary: string; experienceLevels: UserExperienceLevel[]; selectionCriteria: string[]; }
export interface Bean { id: Id; name: string; roaster?: string; origin?: string; process?: string; roastLevel?: "light" | "medium_light" | "medium" | "medium_dark" | "dark"; notes?: string; }
export interface RecipeStep { id: Id; order: number; title: string; targetWaterGrams: number; durationSeconds?: number; pattern?: "center" | "spiral" | "pulse" | "continuous" | "immersion"; instruction: string; }
export interface RecipeVersion { id: Id; recipeId: Id; version: number; title: string; description: string; method: Method; author: string; doseGrams: number; totalWaterGrams: number; temperatureCelsius: number; grindDescription: string; dripper: string; expectedTimeSeconds: number; difficulty: RecipeDifficulty; roastSuitability: RoastSuitability[]; steps: RecipeStep[]; createdAt: ISODateTime; }
export interface Recipe { id: Id; type: RecipeType; currentVersion: RecipeVersion; parentRecipeId?: Id; publishedAt?: ISODateTime; }

export interface QuickPrepareInput { recipeVersionId: Id; coffeeDose: number; waterTotal: number; waterTemperature: number; dripper: string; grindSetting?: string; beanName?: string; equipmentNotes?: string; userGoal?: string; }
export interface BrewPlan { id: Id; sourceRecipeId: Id; sourceRecipeVersion: number; recipeTitle: string; method: Method; coffeeDose: ResolvedParameter<number>; waterTotal: ResolvedParameter<number>; waterTemperature: ResolvedParameter<number>; ratio: number; dripper: ResolvedParameter<string>; grindSetting?: ResolvedParameter<string>; beanMetadata?: { name: string }; equipmentNotes?: string; userGoal?: string; expectedTotalTime: number; stages: BrewStage[]; createdAt: ISODateTime; }
export interface BrewStage { id: Id; order: number; title: string; targetWaterGrams: number; targetDurationSeconds?: number; pattern?: RecipeStep["pattern"]; instruction: string; }
export interface BrewStageResult { stageOrder: number; stageId: Id; actualStartedAt: ISODateTime; actualCompletedAt: ISODateTime; actualDurationSeconds: number; actualWeight: null; weightDifference: null; wasSkipped: false; }

export interface BrewRecipeSnapshot {
  sourceRecipeId?: Id;
  sourceRecipeVersion?: number;
  recipeType: RecipeType;
  title: string;
  description: string;
  method: Method;
  author: string;
  doseGrams: ResolvedParameter<number>;
  totalWaterGrams: ResolvedParameter<number>;
  temperatureCelsius: ResolvedParameter<number>;
  grindDescription?: ResolvedParameter<string>;
  dripper: ResolvedParameter<string>;
  ratio: number;
  expectedTimeSeconds: SourcedValue<number>;
  steps: RecipeStep[];
  userOverrides: Partial<Record<"doseGrams" | "totalWaterGrams" | "temperatureCelsius" | "grindDescription" | "dripper", string | number>>;
  bean?: { id: Id; name: string };
  equipment?: { equipmentId?: Id; dripper: string; grinder?: string; notes?: string };
  userGoal?: string;
  createdAt: ISODateTime;
}

export interface BrewBeanDetails { name?: string; roaster?: string; origin?: string; variety?: string; process?: string; roastLevel?: string; roastDate?: string; }
export interface BrewEquipmentDetails { dripper?: string; grinder?: string; grinderSetting?: string; kettle?: string; filter?: string; }
export interface BrewRecordDetails { bean: BrewBeanDetails | null; equipment: BrewEquipmentDetails | null; actualDoseGrams: number | null; actualWaterGrams: number | null; actualTemperatureCelsius: number | null; notes: string | null; createdAt: ISODateTime; updatedAt: ISODateTime; }
export interface BrewRecordDetailsInput { bean?: Partial<Record<keyof BrewBeanDetails, string | null>> | null; equipment?: Partial<Record<keyof BrewEquipmentDetails, string | null>> | null; actualDoseGrams?: number | null; actualWaterGrams?: number | null; actualTemperatureCelsius?: number | null; notes?: string | null; }
export interface Brew { id: Id; sourceRecipeId: Id; brewPlan: BrewPlan; recipeSnapshot: BrewRecipeSnapshot; executionStatus: BrewExecutionStatus; recordStatus: BrewRecordStatus; feedbackStatus: BrewFeedbackStatus; analysisStatus: BrewAnalysisStatus; analysis: BrewAnalysis | null; analysisAttempt: BrewAnalysisAttempt | null; currentStageOrder: number; currentStageStartedAt: ISODateTime | null; stageResults: BrewStageResult[]; quickRating?: BrewQuickRating; flavorFeedback: FlavorFeedback | null; recordDetails: BrewRecordDetails | null; actualTotalTimeSeconds: number | null; actualTotalWater: number | null; startedAt: ISODateTime | null; completedAt: ISODateTime | null; pausedAt: ISODateTime | null; accumulatedPauseSeconds: number; createdAt: ISODateTime; updatedAt: ISODateTime; }
export interface FlavorFeedback { id: Id; brewId: Id; overallImpression: FlavorOverallImpression; acidity?: FlavorRating; sweetness?: FlavorRating; bitterness?: FlavorRating; body?: FlavorRating; clarity?: FlavorRating; aftertaste?: FlavorRating; balance?: FlavorRating; flavorNotes: FlavorNote[]; freeformNotes?: string; createdAt: ISODateTime; updatedAt: ISODateTime; }
export type FlavorFeedbackInput = Omit<FlavorFeedback, "id" | "brewId" | "createdAt" | "updatedAt">;
export interface InsightEvidence { source: "brew_parameter" | "stage_result" | "flavor_feedback" | "user_note"; reference: string; value: string | number | boolean; }
export interface Insight { id: Id; observation: string; possibleImpact: string; confidence: "low" | "medium" | "high"; evidence: InsightEvidence[]; }
export interface SuggestedPlanChange { variable: "dose" | "water" | "temperature" | "grind" | "pour" | "time"; from?: string | number; to: string | number; reason: string; }
export interface SuggestedPlan { id: Id; sourceBrewId: Id; title: string; primaryChange: SuggestedPlanChange; keepUnchanged: string[]; createdAt: ISODateTime; }
export interface CollectionItem { id: Id; userId: Id; itemType: "recipe" | "bean" | "suggested_plan"; itemId: Id; list: "saved" | "want_to_try"; savedAt: ISODateTime; }
