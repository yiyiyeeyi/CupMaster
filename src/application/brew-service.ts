import type { LocalBrewPreparationRepository } from "@/repositories/local-brew-preparation-repository";
import { writeBrewWithPreparationCleanup } from "@/application/preparation-completion";
import type { Brew, BrewQuickRating, BrewRecordDetailsInput, BrewStageResult, FlavorFeedback, FlavorFeedbackInput, QuickPrepareInput, Recipe } from "@/domain";
import { quickPrepareSchema } from "@/domain";
import { assessAnalysisDataQuality, brewAnalysisResultSchema, buildBrewAnalysisInput, brewRecordDetailsInputSchema, createAnalysisFingerprint, flavorFeedbackInputSchema, normalizeBrewRecordDetailsInput } from "@/domain";
import { createBrewDraft, createUniqueId } from "./brew-factory";
import type { BrewAnalysisProvider } from "./brew-analysis-provider";
import { RuleBasedBrewAnalysisProvider } from "./rule-based-brew-analysis-provider";
import { calculateActiveSeconds } from "@/domain/brew-timer";
import type { BrewRepository, BrewWriteResult } from "@/repositories/brew-repository";

export type BrewDomainErrorCode = "brew_not_found" | "invalid_execution_status" | "no_stages" | "invalid_stage_order" | "duplicate_stage_completion" | "stages_incomplete" | "already_completed" | "already_saved" | "invalid_quick_rating" | "invalid_feedback" | "feedback_not_found" | "already_skipped" | "invalid_record_details" | "analysis_already_pending" | "invalid_analysis_input" | "invalid_analysis_result" | "analysis_provider_failed" | "persistence_failed";
export type BrewOperationResult = { ok: true; value: Brew; resumed?: boolean } | { ok: false; code: BrewDomainErrorCode; message: string; latest?: Brew };
export type LatestBrewResult = { ok: true; value: Brew | null } | { ok: false; code: "persistence_failed"; message: string };
export type JournalResult = { ok: true; value: Brew[]; notice?: string } | { ok: false; code: "persistence_failed"; message: string; value: Brew[] };
export interface BrewServiceDependencies { preparations?: LocalBrewPreparationRepository; now?: () => string; createId?: () => string; analysisProvider?: BrewAnalysisProvider; }

export class BrewService {
  constructor(private readonly repository: BrewRepository, private readonly dependencies: BrewServiceDependencies = {}) {}
  private now() { return this.dependencies.now?.() ?? new Date().toISOString(); }
  createDraft(recipe: Recipe, input: QuickPrepareInput): BrewWriteResult { return this.repository.createDraft(createBrewDraft(recipe, input)); }

  confirmDraftPrepare(brewId: string, input: QuickPrepareInput): BrewOperationResult {
    const read=this.repository.getById(brewId);if(!read.ok&&!read.value)return{ok:false,code:"persistence_failed",message:read.message};const brew=read.value;
    if(!brew)return{ok:false,code:"brew_not_found",message:"The Brew draft no longer exists."};
    if(brew.executionStatus!=="not_started")return{ok:false,code:"invalid_execution_status",message:"A Brew that has started cannot be prepared again.",latest:brew};
    const parsed=quickPrepareSchema.safeParse(input);if(!parsed.success)return{ok:false,code:"invalid_quick_rating",message:parsed.error.issues[0]?.message??"The final Brew parameters are invalid.",latest:brew};
    const handoff=brew.suggestedPlanHandoff;const suggestedChanged=!!handoff&&String(parsed.data[handoff.variable==="water_temperature"?"waterTemperature":handoff.variable==="grind"?"grindSetting":"waterTemperature"]??"")!==String(handoff.suggestedValue??"");
    const resolve=<T,>(value:T,previous:{recipeDefault:T;suggestedPlanValue?:T|null},changed:boolean)=>({value,recipeDefault:previous.recipeDefault,...(previous.suggestedPlanValue!==undefined&&{suggestedPlanValue:previous.suggestedPlanValue}),source:(previous.suggestedPlanValue!==undefined&&!changed?"suggested_plan":value===previous.recipeDefault?"recipe_default":"user_override")as "suggested_plan"|"recipe_default"|"user_override"});
    const now=this.now(),dose=resolve(parsed.data.coffeeDose,brew.recipeSnapshot.doseGrams,parsed.data.coffeeDose!==brew.recipeSnapshot.doseGrams.value),water=resolve(parsed.data.waterTotal,brew.recipeSnapshot.totalWaterGrams,parsed.data.waterTotal!==brew.recipeSnapshot.totalWaterGrams.value),temperature=resolve(parsed.data.waterTemperature,brew.recipeSnapshot.temperatureCelsius,parsed.data.waterTemperature!==brew.recipeSnapshot.temperatureCelsius.value),dripper=resolve(parsed.data.dripper,brew.recipeSnapshot.dripper,parsed.data.dripper!==brew.recipeSnapshot.dripper.value),grind=brew.recipeSnapshot.grindDescription?resolve(parsed.data.grindSetting??"",brew.recipeSnapshot.grindDescription,(parsed.data.grindSetting??"")!==brew.recipeSnapshot.grindDescription.value):undefined;
    const snapshot={...brew.recipeSnapshot,doseGrams:dose,totalWaterGrams:water,temperatureCelsius:temperature,dripper,...(grind&&{grindDescription:grind}),ratio:water.value/dose.value,userOverrides:{...brew.recipeSnapshot.userOverrides,...(dose.source==="user_override"&&{doseGrams:dose.value}),...(water.source==="user_override"&&{totalWaterGrams:water.value}),...(temperature.source==="user_override"&&{temperatureCelsius:temperature.value}),...(dripper.source==="user_override"&&{dripper:dripper.value}),...(grind?.source==="user_override"&&{grindDescription:grind.value})},...(parsed.data.beanName&&{bean:{id:`draft:${brew.id}:bean`,name:parsed.data.beanName}}),equipment:{...brew.recipeSnapshot.equipment,dripper:dripper.value,...(parsed.data.equipmentNotes&&{notes:parsed.data.equipmentNotes})},...(parsed.data.userGoal&&{userGoal:parsed.data.userGoal}),createdAt:now};
    const plan={...brew.brewPlan,coffeeDose:dose,waterTotal:water,waterTemperature:temperature,dripper,...(grind&&{grindSetting:grind}),ratio:snapshot.ratio,...(parsed.data.beanName&&{beanMetadata:{name:parsed.data.beanName}}),...(parsed.data.equipmentNotes&&{equipmentNotes:parsed.data.equipmentNotes}),...(parsed.data.userGoal&&{userGoal:parsed.data.userGoal})};
    const updated:Brew={...brew,brewPlan:plan,recipeSnapshot:snapshot,suggestedPlanHandoff:handoff?{...handoff,userDecision:suggestedChanged?"overridden":"accepted",confirmedAt:now}:null,updatedAt:now};const written=writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);return written.ok?{ok:true,value:written.value}:{ok:false,code:"persistence_failed",message:written.message,latest:brew};
  }

  startBrewSession(brewId: string): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok && !read.value) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "The Brew draft no longer exists." };
    if (brew.legacyPreparationId) return { ok: false, code: "invalid_execution_status", message: "舊準備紀錄已轉換，請從新的準備入口開始。", latest: brew };
    if (brew.executionStatus === "in_progress") return { ok: true, value: brew, resumed: true };
    if (brew.executionStatus !== "not_started") return { ok: false, code: "invalid_execution_status", message: `A ${brew.executionStatus} Brew cannot be started in this step.`, latest: brew };
    if(brew.sourceType==="suggested_plan"&&(!brew.suggestedPlanHandoff||brew.suggestedPlanHandoff.userDecision==="pending"||!brew.suggestedPlanHandoff.confirmedAt))return{ok:false,code:"invalid_execution_status",message:"Review and confirm the Suggested Plan before starting this Brew.",latest:brew};
    if (brew.recipeSnapshot.steps.length === 0) return { ok: false, code: "no_stages", message: "This Brew has no snapshot stages to guide.", latest: brew };
    const now = this.now();
    const updated: Brew = { ...brew, executionStatus: "in_progress", startedAt: now, currentStageStartedAt: now, currentStageOrder: 0, updatedAt: now };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value } : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  restartBrewSession(brewId: string, expectedRun: number): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "找不到這筆 Brew。" };
    if (brew.recordStatus !== "draft" || !["in_progress", "paused"].includes(brew.executionStatus)
      || (brew.executionRun ?? 1) !== expectedRun) {
      return { ok: false, code: "invalid_execution_status", message: "這筆 Brew 的狀態已改變，無法重來。", latest: brew };
    }
    const updated: Brew = {
      ...brew, executionRun: expectedRun + 1, executionStatus: "not_started",
      startedAt: null, completedAt: null, pausedAt: null, accumulatedPauseSeconds: 0,
      currentStageOrder: 0, currentStageStartedAt: null, currentStagePausedSeconds: 0,
      stageResults: [], actualTotalTimeSeconds: null, updatedAt: this.now(),
    };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value }
      : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  pauseBrewSession(brewId: string): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok) return { ok:false, code:"persistence_failed", message:read.message };
    const brew = read.value;
    if (!brew) return { ok:false, code:"brew_not_found", message:"找不到這筆 Brew。" };
    if (brew.executionStatus === "paused") return { ok:true, value:brew };
    if (brew.executionStatus !== "in_progress" || brew.recordStatus !== "draft") return { ok:false, code:"invalid_execution_status", message:"目前無法暫停。", latest:brew };
    const now = this.now();
    const written = writeBrewWithPreparationCleanup(this.repository, { ...brew, executionStatus:"paused", pausedAt:now, updatedAt:now }, this.dependencies.preparations);
    return written.ok ? { ok:true, value:written.value } : { ok:false, code:"persistence_failed", message:written.message, latest:brew };
  }

  resumeBrewSession(brewId: string): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "找不到這筆 Brew。" };
    if (brew.legacyPreparationId) return { ok: false, code: "invalid_execution_status", message: "舊準備紀錄已轉換，請從新的準備入口開始。", latest: brew };
    if (brew.executionStatus === "in_progress") return { ok: true, value: brew, resumed: true };
    const now = this.now();
    const pauseMs = Date.parse(now) - Date.parse(brew.pausedAt ?? "");
    if (brew.executionStatus !== "paused" || !Number.isFinite(pauseMs) || pauseMs < 0) {
      return { ok: false, code: "invalid_execution_status", message: "這筆 Brew 無法繼續。", latest: brew };
    }
    const updated: Brew = {
      ...brew, executionStatus: "in_progress", pausedAt: null,
      accumulatedPauseSeconds: brew.accumulatedPauseSeconds + pauseMs / 1_000,
      currentStagePausedSeconds: (brew.currentStagePausedSeconds ?? 0) + pauseMs / 1_000,
      updatedAt: now,
    };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value, resumed: true }
      : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  completeCurrentStage(brewId: string, expectedStageOrder?: number, completeOnLast = false): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok && !read.value) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "The Brew draft no longer exists." };
    if (brew.executionStatus !== "in_progress") return { ok: false, code: "invalid_execution_status", message: "Only an in-progress Brew can complete a stage.", latest: brew };
    if (expectedStageOrder !== undefined && expectedStageOrder !== brew.currentStageOrder) return { ok: false, code: "duplicate_stage_completion", message: "This stage was already advanced in another action. The latest Brew has been reloaded.", latest: brew };
    const steps = brew.recipeSnapshot.steps;
    if (brew.currentStageOrder < 0 || brew.currentStageOrder >= steps.length) return { ok: false, code: "invalid_stage_order", message: "There is no active stage at this position.", latest: brew };
    const step = steps[brew.currentStageOrder];
    if (brew.stageResults.some((result) => result.stageOrder === brew.currentStageOrder || result.stageId === step.id)) return { ok: false, code: "duplicate_stage_completion", message: "This stage already has a saved result.", latest: brew };
    if (!brew.currentStageStartedAt) return { ok: false, code: "invalid_stage_order", message: "The active stage has no valid start timestamp.", latest: brew };
    const now = this.now();
    const result: BrewStageResult = { stageOrder: brew.currentStageOrder, stageId: step.id, actualStartedAt: brew.currentStageStartedAt, actualCompletedAt: now, actualDurationSeconds: calculateActiveSeconds(brew.currentStageStartedAt, brew.currentStagePausedSeconds ?? 0, Date.parse(now)), actualWeight: null, weightDifference: null, wasSkipped: false };
    const updated: Brew = { ...brew, executionStatus: "in_progress", currentStageOrder: brew.currentStageOrder + 1, currentStageStartedAt: now, ...(brew.currentStagePausedSeconds !== undefined && { currentStagePausedSeconds: 0 }), stageResults: [...brew.stageResults, result], updatedAt: now };
      if (completeOnLast && updated.currentStageOrder === steps.length) {
        updated.executionStatus = "completed";
        updated.recordStatus = "saved";
        updated.feedbackStatus = "awaiting_feedback";
        updated.completedAt = now;
        updated.currentStageStartedAt = null;
        updated.actualTotalTimeSeconds = Math.floor(calculateActiveSeconds(brew.startedAt, brew.accumulatedPauseSeconds, Date.parse(now)));
      }
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value } : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  completeBrewSession(brewId: string): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok && !read.value) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "The Brew no longer exists." };
    if (brew.executionStatus === "completed") return { ok: false, code: "already_completed", message: "This Brew was already completed.", latest: brew };
    if (brew.executionStatus !== "in_progress") return { ok: false, code: "invalid_execution_status", message: "Only an in-progress Brew can be completed.", latest: brew };
    const steps = brew.recipeSnapshot.steps;
    const hasEveryResult = steps.length > 0 && steps.every((step, index) => brew.stageResults.some((result) => result.stageOrder === index && result.stageId === step.id));
    if (!hasEveryResult || brew.currentStageOrder !== steps.length) return { ok: false, code: "stages_incomplete", message: "Complete every required stage before completing this Brew.", latest: brew };
    const now = this.now();
    const actualTotalTimeSeconds = Math.floor(calculateActiveSeconds(brew.startedAt, brew.accumulatedPauseSeconds, Date.parse(now)));
    const updated: Brew = { ...brew, executionStatus: "completed", completedAt: now, currentStageStartedAt: null, actualTotalTimeSeconds, actualTotalWater: null, recordStatus: "saved", feedbackStatus: "awaiting_feedback", analysisStatus: "not_requested", updatedAt: now };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value } : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  saveCompletedBrew(brewId: string, input: { quickRating?: string } = {}): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "The Brew no longer exists." };
    if (brew.executionStatus !== "completed") return { ok: false, code: "invalid_execution_status", message: "Finish the Brew before saving it to Journal.", latest: brew };
    const allowed: BrewQuickRating[] = ["liked", "neutral", "disliked", "skipped"];
    if (input.quickRating !== undefined && !allowed.includes(input.quickRating as BrewQuickRating)) return { ok: false, code: "invalid_quick_rating", message: "The selected quick rating is invalid.", latest: brew };
    const rating = input.quickRating as BrewQuickRating | undefined; const now = this.now();
    if (rating && rating !== "skipped") return this.setOverallImpression(brewId, rating);
    if (brew.recordStatus === "saved" && rating === undefined) return { ok: true, value: brew };
    const updated: Brew = { ...brew, recordStatus: "saved", feedbackStatus: rating === "skipped" && !brew.flavorFeedback ? "skipped" : brew.feedbackStatus, updatedAt: now };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value } : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  getFlavorFeedback(brewId: string): { ok: true; value: FlavorFeedback | null; brew: Brew } | { ok: false; code: "brew_not_found" | "persistence_failed"; message: string } {
    const read = this.repository.getById(brewId);
    if (!read.ok && !read.value) return { ok: false, code: "persistence_failed", message: read.message };
    if (!read.value) return { ok: false, code: "brew_not_found", message: "The Brew no longer exists." };
    return { ok: true, value: read.value.flavorFeedback, brew: read.value };
  }

  setOverallImpression(brewId: string, impression: string): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "找不到這筆 Brew。" };
    if (brew.executionStatus !== "completed") return { ok: false, code: "invalid_execution_status", message: "沖完後才能記錄感受。", latest: brew };
    if (impression !== "liked" && impression !== "neutral" && impression !== "disliked") return { ok: false, code: "invalid_feedback", message: "請選擇有效的感受。", latest: brew };
    const now = this.now();
    const feedback: FlavorFeedback = { ...(brew.flavorFeedback ?? { id: this.dependencies.createId?.() ?? createUniqueId(), brewId, flavorNotes: [], createdAt: now }), overallImpression: impression, updatedAt: now };
    const updated: Brew = { ...brew, flavorFeedback: feedback, updatedAt: now };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value } : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  upsertFlavorFeedback(brewId: string, input: FlavorFeedbackInput): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok && !read.value) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "The Brew no longer exists." };
    if (brew.executionStatus !== "completed") return { ok: false, code: "invalid_execution_status", message: "Complete the Brew before adding flavor feedback.", latest: brew };
    const parsed = flavorFeedbackInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "invalid_feedback", message: parsed.error.issues[0]?.message ?? "The flavor feedback is invalid.", latest: brew };
    const now = this.now();
    const feedback: FlavorFeedback = { ...parsed.data, id: brew.flavorFeedback?.id ?? this.dependencies.createId?.() ?? createUniqueId(), brewId: brew.id, createdAt: brew.flavorFeedback?.createdAt ?? now, updatedAt: now };
    const updated: Brew = { ...brew, flavorFeedback: feedback, feedbackStatus: "completed", updatedAt: now };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value } : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  skipFlavorFeedback(brewId: string): BrewOperationResult {
    const read = this.repository.getById(brewId);
    if (!read.ok && !read.value) return { ok: false, code: "persistence_failed", message: read.message };
    const brew = read.value;
    if (!brew) return { ok: false, code: "brew_not_found", message: "The Brew no longer exists." };
    if (brew.executionStatus !== "completed") return { ok: false, code: "invalid_execution_status", message: "Complete the Brew before skipping flavor feedback.", latest: brew };
    if (brew.feedbackStatus === "skipped" && !brew.flavorFeedback) return { ok: false, code: "already_skipped", message: "Flavor feedback is already marked for later.", latest: brew };
    const now = this.now();
    const updated: Brew = { ...brew, feedbackStatus: "skipped", updatedAt: now };
    const written = writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations);
    return written.ok ? { ok: true, value: written.value } : { ok: false, code: "persistence_failed", message: written.message, latest: brew };
  }

  getBrewRecordDetails(brewId:string): {ok:true;value:Brew["recordDetails"];brew:Brew}|{ok:false;code:"brew_not_found"|"persistence_failed";message:string} { const read=this.repository.getById(brewId); if(!read.ok&&!read.value)return {ok:false,code:"persistence_failed",message:read.message}; if(!read.value)return {ok:false,code:"brew_not_found",message:"The Brew no longer exists."}; return {ok:true,value:read.value.recordDetails,brew:read.value}; }
  upsertBrewRecordDetails(brewId:string,input:BrewRecordDetailsInput):BrewOperationResult { const read=this.repository.getById(brewId); if(!read.ok&&!read.value)return {ok:false,code:"persistence_failed",message:read.message}; const brew=read.value; if(!brew)return {ok:false,code:"brew_not_found",message:"The Brew no longer exists."}; if(brew.executionStatus!=="completed")return {ok:false,code:"invalid_execution_status",message:"Complete the Brew before editing its historical record.",latest:brew}; const parsed=brewRecordDetailsInputSchema.safeParse(input); if(!parsed.success)return {ok:false,code:"invalid_record_details",message:parsed.error.issues[0]?.message??"The Brew details are invalid.",latest:brew}; const normalized=normalizeBrewRecordDetailsInput(parsed.data); const now=this.now(); const recordDetails=normalized?{...normalized,createdAt:brew.recordDetails?.createdAt??now,updatedAt:now}:null; const updated:Brew={...brew,recordDetails,updatedAt:now}; const written=writeBrewWithPreparationCleanup(this.repository, updated, this.dependencies.preparations); return written.ok?{ok:true,value:written.value}:{ok:false,code:"persistence_failed",message:written.message,latest:brew}; }

  getBrewAnalysis(brewId:string):{ok:true;brew:Brew}|{ok:false;code:"brew_not_found"|"persistence_failed";message:string}{const read=this.repository.getById(brewId);if(!read.ok&&!read.value)return{ok:false,code:"persistence_failed",message:read.message};if(!read.value)return{ok:false,code:"brew_not_found",message:"The Brew no longer exists."};return{ok:true,brew:read.value}}
  async requestBrewAnalysis(brewId:string):Promise<BrewOperationResult>{const read=this.repository.getById(brewId);if(!read.ok&&!read.value)return{ok:false,code:"persistence_failed",message:read.message};const brew=read.value;if(!brew)return{ok:false,code:"brew_not_found",message:"The Brew no longer exists."};if(brew.executionStatus!=="completed")return{ok:false,code:"invalid_execution_status",message:"Complete the Brew before requesting analysis.",latest:brew};if(brew.analysisStatus==="pending")return{ok:false,code:"analysis_already_pending",message:"Analysis is already in progress.",latest:brew};let input;try{input=buildBrewAnalysisInput(brew)}catch{return{ok:false,code:"invalid_analysis_input",message:"The Brew record could not be prepared for analysis.",latest:brew}}const provider=this.dependencies.analysisProvider??new RuleBasedBrewAnalysisProvider(),requestedAt=this.now(),attemptId=this.dependencies.createId?.()??createUniqueId();const pending:Brew={...brew,analysisStatus:"pending",analysisAttempt:{id:attemptId,requestedAt,completedAt:null,status:"pending",provider:provider.provider,model:provider.model,errorCode:null,errorMessage:null},updatedAt:requestedAt};const pendingWrite=writeBrewWithPreparationCleanup(this.repository, pending);if(!pendingWrite.ok)return{ok:false,code:"persistence_failed",message:pendingWrite.message,latest:brew};let result;try{result=await provider.analyze(input)}catch{return this.finishAnalysisFailure(brewId,attemptId,"analysis_provider_failed","The local preview provider could not complete this attempt.")}const parsed=brewAnalysisResultSchema.safeParse(result);if(!parsed.success)return this.finishAnalysisFailure(brewId,attemptId,"invalid_analysis_result","The preview returned an invalid structured result.");const latest=this.repository.getById(brewId);if(!latest.value)return{ok:false,code:"brew_not_found",message:"The Brew no longer exists."};const generatedAt=this.now(),quality=assessAnalysisDataQuality(latest.value),analysis={id:this.dependencies.createId?.()??createUniqueId(),brewId,schemaVersion:1 as const,status:"completed" as const,generatedAt,provider:provider.provider,model:provider.model,sourceFingerprint:createAnalysisFingerprint(latest.value),inputSummary:{dataQuality:quality,missingData:quality.missingFields},result:parsed.data};const completed:Brew={...latest.value,analysisStatus:"completed",analysis,analysisAttempt:{id:attemptId,requestedAt,completedAt:generatedAt,status:"completed",provider:provider.provider,model:provider.model,errorCode:null,errorMessage:null},updatedAt:generatedAt};const write=writeBrewWithPreparationCleanup(this.repository, completed);return write.ok?{ok:true,value:write.value}:{ok:false,code:"persistence_failed",message:write.message,latest:latest.value}}
  private finishAnalysisFailure(brewId:string,attemptId:string,code:"analysis_provider_failed"|"invalid_analysis_result",message:string):BrewOperationResult{const latest=this.repository.getById(brewId);if(!latest.value)return{ok:false,code:"brew_not_found",message:"The Brew no longer exists."};const completedAt=this.now(),previous=latest.value.analysisAttempt;const failed:Brew={...latest.value,analysisStatus:"failed",analysisAttempt:{id:attemptId,requestedAt:previous?.requestedAt??completedAt,completedAt,status:"failed",provider:previous?.provider??"local_mock",model:previous?.model??"rule-based-v1",errorCode:code,errorMessage:message},updatedAt:completedAt};const write=writeBrewWithPreparationCleanup(this.repository, failed);return write.ok?{ok:false,code,message,latest:write.value}:{ok:false,code:"persistence_failed",message:write.message,latest:latest.value}}

  listJournalEntries(): JournalResult { const read = this.repository.listJournalEntries(); return read.ok ? { ok: true, value: read.value, ...(read.notice && { notice: read.notice }) } : { ok: false, code: "persistence_failed", message: read.message, value: read.value }; }

  getLatestInProgressBrew(): LatestBrewResult {
    const read = this.repository.listDrafts();
    if (!read.ok) return { ok: false, code: "persistence_failed", message: read.message };
    const candidates = read.value.filter((brew) => brew.executionStatus === "in_progress").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.startedAt?.localeCompare(a.startedAt ?? "") || a.id.localeCompare(b.id));
    return { ok: true, value: candidates[0] ?? null };
  }
}
