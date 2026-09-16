import { z } from "zod";
import { userNeedSchema, experienceLevelSchema, suggestedBrewPlanSchema } from "@/domain";
import { brewPersistenceSchema } from "@/data/local-brew-schema";

export const demoFixtureSchema = z.object({
  profile: z.object({ displayName: z.string().trim().min(2).max(40), experienceLevel: experienceLevelSchema, selectedNeeds: z.array(userNeedSchema) }),
  brews: z.array(brewPersistenceSchema), plans: z.array(suggestedBrewPlanSchema),
}).superRefine((value, context) => {
  const brewIds = new Set<string>(), planIds = new Set<string>();
  for (const brew of value.brews) {
    if (brewIds.has(brew.id)) context.addIssue({ code: "custom", path: ["brews"], message: `Duplicate Brew ID: ${brew.id}` });
    brewIds.add(brew.id);
    const stepIds = new Set(brew.recipeSnapshot.steps.map((step) => step.id));
    if (brew.stageResults.some((result) => !stepIds.has(result.stageId))) context.addIssue({ code: "custom", path: ["brews", brew.id, "stageResults"], message: "Stage Result does not match the immutable Snapshot." });
    if (brew.sourceType === "recipe" && brew.suggestedPlanHandoff) context.addIssue({ code: "custom", path: ["brews", brew.id], message: "Recipe Brew cannot have a Suggested Plan handoff." });
    if (brew.sourceType === "suggested_plan" && !brew.sourceSuggestedPlanId) context.addIssue({ code: "custom", path: ["brews", brew.id], message: "Suggested Plan Brew requires sourceSuggestedPlanId." });
    if (brew.suggestedPlanHandoff?.userDecision === "pending" && brew.suggestedPlanHandoff.confirmedAt) context.addIssue({ code: "custom", path: ["brews", brew.id], message: "Pending handoff cannot be confirmed." });
    if (brew.suggestedPlanHandoff && brew.suggestedPlanHandoff.userDecision !== "pending" && !brew.suggestedPlanHandoff.confirmedAt) context.addIssue({ code: "custom", path: ["brews", brew.id], message: "Accepted or overridden handoff requires confirmedAt." });
  }
  for (const plan of value.plans) {
    if (planIds.has(plan.id)) context.addIssue({ code: "custom", path: ["plans"], message: `Duplicate Plan ID: ${plan.id}` });
    planIds.add(plan.id);
    if (!brewIds.has(plan.sourceBrewId)) context.addIssue({ code: "custom", path: ["plans", plan.id, "sourceBrewId"], message: "Source Brew is missing." });
    const resulting = plan.resultingBrewId ? value.brews.find((brew) => brew.id === plan.resultingBrewId) : undefined;
    if (resulting && resulting.sourceSuggestedPlanId !== plan.id) context.addIssue({ code: "custom", path: ["plans", plan.id], message: "Plan/Brew mapping does not agree." });
    if (plan.status === "used" && (!resulting?.startedAt || plan.usedAt !== resulting.startedAt)) context.addIssue({ code: "custom", path: ["plans", plan.id, "usedAt"], message: "Used Plan must align to resulting Brew startedAt." });
    if (plan.status === "draft" && resulting && resulting.executionStatus !== "not_started") context.addIssue({ code: "custom", path: ["plans", plan.id, "status"], message: "Draft Plan can only map to a not-started Brew." });
  }
});
