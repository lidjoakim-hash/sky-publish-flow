import { afterEach, describe, expect, it } from "vitest";
import { allowedPlatforms, canSend, connectionMode, normalizePlatforms, requiredScopes, requiredSecrets } from "@/lib/brand-publishing";
import { verifyInstagramLogin, verifyMetaConnection, type GraphGet } from "@/lib/meta-verify";
import { readMetaCreds } from "@/lib/meta.server";
import { buildDryRun } from "@/lib/dry-run";

const keep = { ...process.env };
afterEach(() => { process.env = { ...keep }; });

describe("Norge routing", () => {
  it("uses Instagram Login; existing businesses keep Facebook Login", () => {
    expect(connectionMode("norge")).toBe("instagram_login");
    for (const b of ["skyline", "lidverk", "tekstilrens"]) expect(connectionMode(b)).toBe("facebook_login");
  });
  it("Instagram only — Facebook cannot be chosen or sent", () => {
    expect(allowedPlatforms("norge")).toEqual(["instagram"]);
    expect(() => normalizePlatforms(["facebook"], "norge")).toThrow(/Instagram only/);
    expect(canSend({ globalActive: true, row: { brand_slug: "norge", platforms: ["instagram", "facebook"], enabled: true }, connected: true, brand: "norge" }, "facebook")).toBe(false);
  });
  it("needs only its own IG token + id, no Page secret, Instagram Login scopes", () => {
    expect(requiredSecrets("norge", ["instagram"])).toEqual(["META_NORGE_IG_ACCESS_TOKEN", "META_NORGE_IG_USER_ID"]);
    expect(requiredScopes(["instagram"], "norge")).toEqual(["instagram_business_basic", "instagram_business_content_publish"]);
  });
  it("reads its own token on graph.instagram.com, never Skyline's", () => {
    process.env.META_PAGE_ACCESS_TOKEN = "sky"; process.env.META_PAGE_ID = "1"; process.env.META_IG_USER_ID = "2";
    delete process.env.META_NORGE_IG_ACCESS_TOKEN; delete process.env.META_NORGE_IG_USER_ID;
    expect(readMetaCreds("norge", ["instagram"])).toBeNull();
    process.env.META_NORGE_IG_ACCESS_TOKEN = "nor"; process.env.META_NORGE_IG_USER_ID = "77";
    expect(readMetaCreds("norge", ["instagram"])).toMatchObject({ token: "nor", igUserId: "77", pageId: "", host: "graph.instagram.com" });
  });
  it("existing connections unchanged: Skyline still on graph.facebook.com", () => {
    process.env.META_PAGE_ACCESS_TOKEN = "sky"; process.env.META_PAGE_ID = "1"; process.env.META_IG_USER_ID = "2";
    expect(readMetaCreds("skyline")).toMatchObject({ token: "sky", host: "graph.facebook.com" });
  });
});

function fake(me: Record<string, string>, publishOk = true) {
  const calls: string[] = [];
  const get: GraphGet = async <T,>(path: string) => {
    calls.push(path);
    if (path === "me") return me as T;
    if (path.endsWith("content_publishing_limit")) { if (!publishOk) throw new Error("permission denied"); return { data: [] } as T; }
    throw new Error("unexpected " + path);
  };
  return { get, calls };
}

describe("Instagram Login check (no Page)", () => {
  it("connects only with matching @norge_no and id, using read-only calls", async () => {
    const { get, calls } = fake({ user_id: "77", username: "norge_no", account_type: "BUSINESS" });
    const r = await verifyInstagramLogin(get, { igUserId: "77", expectedUsername: "norge_no" });
    expect(r.status).toBe("connected");
    expect(r.message).toMatch(/paused/);
    expect(calls).toEqual(["me", "77/content_publishing_limit"]);
  });
  it("rejects a different account", async () => {
    const r = await verifyInstagramLogin(fake({ user_id: "77", username: "someone_else" }).get, { igUserId: "77", expectedUsername: "norge_no" });
    expect(r.status).toBe("error");
  });
  it("rejects an id mismatch", async () => {
    const r = await verifyInstagramLogin(fake({ user_id: "88", username: "norge_no" }).get, { igUserId: "77", expectedUsername: "norge_no" });
    expect(r.message).toMatch(/does not match/);
  });
  it("reports missing publish permission truthfully", async () => {
    const r = await verifyInstagramLogin(fake({ user_id: "77", username: "norge_no", account_type: "BUSINESS" }, false).get, { igUserId: "77", expectedUsername: "norge_no" });
    expect(r.status).toBe("error");
    expect(r.message).toMatch(/instagram_business_content_publish/);
  });
  it("Facebook Login check still requires the Page (regression)", async () => {
    const get: GraphGet = async <T,>(p: string) => (p === "me" ? { id: "1", name: "Other" } : {}) as T;
    expect((await verifyMetaConnection(get, { pageId: "9", igUserId: null, platforms: ["facebook"] })).status).toBe("error");
  });
});

describe("Norge paused / dry run", () => {
  const base = { brand: "norge", mode: "instagram_login" as const, platforms: ["instagram"], timeZone: "Europe/Oslo", connection: { status: "connected", ig_username: "norge_no" }, secretsPresent: {}, assets: [] };
  it("paused Norge would not send, even with global switch on", () => {
    const r = buildDryRun({ ...base, enabled: false, globalActive: true });
    expect(r.targets).toEqual([{ platform: "instagram", allowed: true, wouldSendNow: false }]);
    expect(r.metaCalls).toBe(0);
    expect(r.account.facebookPage).toBeNull();
  });
});
