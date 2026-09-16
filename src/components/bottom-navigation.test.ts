import { describe, expect, it } from "vitest";
import { getActiveNavigationHref } from "./bottom-navigation";
describe("Bottom Navigation active route", () => {
  it.each([["/discover","/discover"],["/recipes/r1","/discover"],["/recipes/r1/prepare","/brew"],["/brew","/brew"],["/brew/b1","/brew"],["/brew/b1/complete","/brew"],["/journal","/journal"],["/journal/b1/feedback","/journal"],["/journal/b1/plans","/journal"],["/plans/p1","/journal"]])("maps %s to one active tab", (route, expected) => expect(getActiveNavigationHref(route)).toBe(expected));
});
