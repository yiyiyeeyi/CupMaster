import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createFullDemoFixtures } from "@/dev/demo-fixtures";

const origin = process.env.CUPMASTER_AUTH_TEST_URL;

it.skipIf(!origin)("isolates all six cloud tables by authenticated account", async () => {
  const prefix = `qa-${randomUUID()}`;
  const auth = async (suffix: string) => {
    const email = `${prefix}-${suffix}@example.test`;
    const password = randomUUID();
    const post = (action: string, body: object, cookie?: string) => fetch(`${origin}/api/auth/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: origin!, ...(cookie && { cookie }) },
      body: JSON.stringify(body),
    });
    const registered = await post("sign-up/email", { name: `QA ${suffix}`, email, password });
    expect(registered.status).toBe(200);
    const user = (await registered.json()).user;
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    const initialCookie = registered.headers.getSetCookie().map(line => line.split(";")[0]).join("; ");
    expect((await post("sign-out", {}, initialCookie)).status).toBe(200);
    const signedIn = await post("sign-in/email", { email, password });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers.getSetCookie().map(line => line.split(";")[0]).join("; ");
    return { id: String(user.id), cookie };
  };
  const [a, b] = await Promise.all([auth("a"), auth("b")]);
  const request = (account: typeof a | null, resource: string, action: string, args: unknown[] = [], expectedUserId = account?.id) =>
    fetch(`${origin}/api/cloud/${resource}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(account && { cookie: account.cookie, "x-cupmaster-account": expectedUserId! }) },
      body: JSON.stringify({ action, args, user_id: a.id }),
    });
  const expectValue = async (response: Response, value: unknown) => {
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, value });
  };

  for (const [resource, action] of [["nickname", "ensure"], ["profile", "load"], ["brew", "listAll"], ["suggested-plan", "list"], ["parity", "listBeansForMigration"], ["parity", "listPreparationsForMigration"], ["parity", "readLibraryState"]]) {
    expect((await request(null, resource, action)).status).toBe(401);
  }
  await expectValue(await request(a, "nickname", "confirm", ["隔離測試甲"]), { id: a.id, display_name: "隔離測試甲", preferences: { displayNameConfirmed: true, experienceLevelSource: "unset" } });
  await expectValue(await request(a, "nickname", "confirm", ["其他暱稱"]), { display_name: "隔離測試甲" });
  await expectValue(await request(b, "profile", "load"), null);
  expect((await request(b, "profile", "load", [], a.id)).status).toBe(403);
  await expectValue(await request(b, "profile", "remove"), null);
  const profile = await (await request(a, "profile", "load")).json();
  expect((await request(b, "profile", "updateIfRevision", [profile.value, profile.revision])).status).toBe(403);

  const fixture = createFullDemoFixtures();
  const brew = { ...fixture.brews[0], id: `${prefix}-brew`, user_id: b.id };
  const plan = { ...fixture.plans[0], id: `${prefix}-plan`, sourceBrewId: brew.id, status: "draft", usedAt: null, resultingBrewId: null };
  await expectValue(await request(a, "brew", "createDraft", [brew]), { id: brew.id });
  await expectValue(await request(b, "brew", "getById", [brew.id]), null);
  expect((await request(b, "brew", "updateIfRevision", [brew, 1])).status).toBe(409);
  expect((await request(b, "brew", "deleteDraft", [brew.id])).status).toBe(404);
  await expectValue(await request(a, "suggested-plan", "create", [plan]), { id: plan.id });
  await expectValue(await request(b, "suggested-plan", "getById", [plan.id]), null);
  expect((await request(b, "suggested-plan", "updateIfRevision", [plan, 1])).status).toBe(409);
  await expectValue(await request(b, "suggested-plan", "removeByIdPrefix", [prefix]), 0);

  const at = new Date().toISOString();
  const bean = { id: `${prefix}-bean`, name: "QA Bean", createdAt: at, updatedAt: at, user_id: b.id };
  const prep = { id: `${prefix}-preparation`, entry: null, deletedAt: at, user_id: b.id };
  const library = { legacyImportReviewed: true, redirects: {}, lineage: {}, deletedIds: [prep.id], user_id: b.id };
  await expectValue(await request(a, "parity", "writeBean", [bean]), { entity: { id: bean.id }, revision: 1 });
  await expectValue(await request(a, "parity", "writePreparation", [prep]), { entity: { id: prep.id }, revision: 1 });
  await expectValue(await request(a, "parity", "writeLibraryState", [library]), { revision: 1 });
  await expectValue(await request(b, "parity", "listBeansForMigration"), []);
  await expectValue(await request(b, "parity", "listPreparationsForMigration"), []);
  await expectValue(await request(b, "parity", "readLibraryState"), null);
  expect((await request(b, "parity", "writeBean", [{ ...bean, deletedAt: at }, 1])).status).toBe(409);
  expect((await request(b, "parity", "writePreparation", [prep, 1])).status).toBe(409);
  expect((await request(b, "parity", "writeLibraryState", [{ ...library, deletedIds: [] }, 1])).status).toBe(409);

  await expectValue(await request(a, "profile", "load"), { profile: { id: a.id, displayName: "隔離測試甲" } });
  await expectValue(await request(a, "brew", "getById", [brew.id]), { id: brew.id });
  await expectValue(await request(a, "suggested-plan", "getById", [plan.id]), { id: plan.id });
  await expectValue(await request(a, "parity", "listBeansForMigration"), [{ entity: { id: bean.id }, revision: 1 }]);
  await expectValue(await request(a, "parity", "listPreparationsForMigration"), [{ entity: { id: prep.id }, revision: 1 }]);
  await expectValue(await request(a, "parity", "readLibraryState"), { entity: { deletedIds: [prep.id] }, revision: 1 });
}, 60000);
