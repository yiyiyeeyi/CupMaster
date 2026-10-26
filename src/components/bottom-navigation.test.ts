import { describe, expect, it } from "vitest";
import { getActiveNavigationHref, isBottomNavigationVisible, legacyStartRedirect, safePrepareReturnTo } from "@/domain/start-navigation";
import { prepareEntryQuerySchema } from "@/domain/prepare-entry-query";
describe("Bottom Navigation route policy", () => {
  it.each([["/discover", "/discover"], ["/recipes/r1", "/discover"], ["/journal", "/journal"], ["/journal/b1/feedback", "/journal"], ["/plans/p1", "/journal"], ["/me", "/me"], ["/brew/prepare", null]])("maps %s to %s", (path, expected) => expect(getActiveNavigationHref(path)).toBe(expected));
  it.each(["/", "/brew", "/brew/b1", "/brew/b1/prepare", "/brew/b1/complete", "/brew/prepare", "/recipes/r1/prepare", "/auth", "/onboarding", "/dev/demo"])("hides navigation at %s", path => expect(isBottomNavigationVisible(path)).toBe(false));
  it("hides the just-completed flow while retaining normal historical Brew Detail navigation", () => {
    expect(isBottomNavigationVisible("/journal/b1", "justCompleted=1&from=brew")).toBe(false);
    expect(isBottomNavigationVisible("/journal/b1", "justCompleted=0")).toBe(true);
    expect(isBottomNavigationVisible("/journal")).toBe(true);
    expect(isBottomNavigationVisible("/me")).toBe(true);
  });
  it("retains old query keys and repeated values, sanitizing only unsafe returnTo", () => {
    const url = new URL(legacyStartRedirect("/brew/prepare", { campaign: ["a", "b"], returnTo: "https://evil.test", filter: "completed" }), "https://cupmaster.local");
    expect(url.searchParams.getAll("campaign")).toEqual(["a", "b"]);
    expect(url.searchParams.get("filter")).toBe("completed"); expect(url.searchParams.get("returnTo")).toBe("/discover");
    const onboarding = new URL(legacyStartRedirect("/discover", { returnTo: "/journal?filter=preparations", tag: "a b" }, { preferences: "edit" }), "https://cupmaster.local");
    expect(onboarding.searchParams.get("returnTo")).toBe("/journal?filter=preparations");
    expect(onboarding.searchParams.get("tag")).toBe("a b"); expect(onboarding.searchParams.get("preferences")).toBe("edit");
  });
  it.each(["//evil.test", "/\\evil.test", "/brew/b1", "/journal/../auth", "/%2f%2fevil.test"])("rejects unsafe/non-origin-page return %s", value => expect(safePrepareReturnTo(value)).toBe("/discover"));
  it("rejects ambiguous seed modes and duplicate ID query values", () => {
    expect(prepareEntryQuerySchema.safeParse({ entry: "quick", preparationId: "p" }).success).toBe(false);
    expect(prepareEntryQuerySchema.safeParse({ recommendationId: "r" }).success).toBe(false);
    expect(prepareEntryQuerySchema.safeParse({ sourceBrewId: ["a", "b"] }).success).toBe(false);
    expect(prepareEntryQuerySchema.safeParse({ campaign: "a" }).success).toBe(true);
  });
});
