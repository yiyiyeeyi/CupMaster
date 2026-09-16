import type { Recipe, UserExperienceLevel } from "./types";

const difficultyRank = { beginner: 0, easy: 1, intermediate: 2, advanced: 3 } as const;
const experienceTarget: Record<UserExperienceLevel, number> = { beginner: 0, developing: 1, intermediate: 2, advanced: 3 };

export function calculateRatio(doseGrams: number, waterGrams: number): number | null {
  if (!Number.isFinite(doseGrams) || !Number.isFinite(waterGrams) || doseGrams <= 0 || waterGrams <= 0) return null;
  return waterGrams / doseGrams;
}

export function formatRatio(doseGrams: number, waterGrams: number): string | null {
  const ratio = calculateRatio(doseGrams, waterGrams);
  return ratio === null ? null : `1:${ratio.toFixed(1)}`;
}

export function sortRecipesForExperience(recipes: Recipe[], experience?: UserExperienceLevel): Recipe[] {
  if (!experience) return [...recipes];
  const target = experienceTarget[experience];
  return [...recipes].sort((a, b) => {
    const distance = Math.abs(difficultyRank[a.currentVersion.difficulty] - target) - Math.abs(difficultyRank[b.currentVersion.difficulty] - target);
    return distance || a.currentVersion.title.localeCompare(b.currentVersion.title, "zh-Hant");
  });
}
