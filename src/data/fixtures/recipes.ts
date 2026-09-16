import { recipeSchema } from "@/domain";
import type { Recipe } from "@/domain";

const createdAt = "2026-07-15T00:00:00.000Z";
const rawRecipes = [
  { id: "gentle-start", title: "Gentle Start", description: "A forgiving two-pour method with a calm pace for a first brew.", author: "CupMaster", dose: 15, water: 240, temp: 92, grind: "Medium, like fine sand", dripper: "V60 02", time: 165, difficulty: "beginner", roast: ["medium_light", "medium"], steps: [["Bloom", 45, 40, "spiral", "Wet all grounds and wait."], ["Main pour", 240, 90, "spiral", "Pour slowly to the final target."]] },
  { id: "v60-balanced-three-pour", title: "Balanced V60", description: "A standard bloom plus three controlled pours for clarity and balance.", author: "General Method", dose: 15, water: 250, temp: 93, grind: "Medium-fine", dripper: "V60 02", time: 180, difficulty: "easy", roast: ["light", "medium_light"], steps: [["Bloom", 45, 40, "spiral", "Saturate evenly."], ["First pour", 120, 35, "spiral", "Pour in small outward circles."], ["Second pour", 185, 35, "spiral", "Keep the slurry height steady."], ["Final pour", 250, 35, "center", "Finish gently near the center."]] },
  { id: "center-focus", title: "Center Focus", description: "A low-agitation center-pour recipe suited to rounder, deeper cups.", author: "CupMaster", dose: 16, water: 240, temp: 91, grind: "Medium", dripper: "Flat-bottom dripper", time: 170, difficulty: "easy", roast: ["medium", "medium_dark"], steps: [["Bloom", 48, 40, "center", "Pour through the center, then gently swirl."], ["Center pour", 150, 50, "center", "Maintain a narrow steady stream."], ["Finish", 240, 45, "center", "Continue at the center to target."]] },
  { id: "quick-morning", title: "Quick Morning", description: "A short, practical brew with one bloom and one continuous pour.", author: "General Method", dose: 12, water: 200, temp: 92, grind: "Medium-fine", dripper: "Cone dripper", time: 125, difficulty: "beginner", roast: ["medium_light", "medium"], steps: [["Bloom", 36, 30, "spiral", "Wet all coffee quickly."], ["Continuous pour", 200, 60, "continuous", "Pour smoothly without stopping."]] },
  { id: "clarity-pulse", title: "Clarity Pulse", description: "Five precise pulses for experienced brewers exploring high clarity.", author: "Community Method", dose: 18, water: 300, temp: 95, grind: "Medium-fine, adjust for drawdown", dripper: "V60 02", time: 210, difficulty: "advanced", roast: ["light"], steps: [["Bloom", 54, 45, "spiral", "Saturate and swirl once."], ["Pulse one", 110, 25, "spiral", "Use a controlled circular pour."], ["Pulse two", 165, 25, "spiral", "Let the slurry fall slightly."], ["Pulse three", 230, 25, "center", "Reduce agitation at center."], ["Final pulse", 300, 25, "center", "Finish gently and allow drawdown."]] },
] as const;

export const recipeFixtures: Recipe[] = rawRecipes.map((item) => recipeSchema.parse({
  id: item.id, type: "official", publishedAt: createdAt,
  currentVersion: {
    id: `${item.id}-v1`, recipeId: item.id, version: 1, title: item.title, description: item.description,
    method: "pour_over", author: item.author, doseGrams: item.dose, totalWaterGrams: item.water,
    temperatureCelsius: item.temp, grindDescription: item.grind, dripper: item.dripper,
    expectedTimeSeconds: item.time, difficulty: item.difficulty, roastSuitability: [...item.roast], createdAt,
    steps: item.steps.map(([title, targetWaterGrams, durationSeconds, pattern, instruction], index) => ({ id: `${item.id}-step-${index + 1}`, order: index + 1, title, targetWaterGrams, durationSeconds, pattern, instruction })),
  },
}));
