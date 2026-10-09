import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canSend, enableBlocker, metaSecretNames, normalizePlatforms, requiredScopes, requiredSecrets } from "@/lib/brand-publishing";
import { verifyMetaConnection, type GraphGet } from "@/lib/meta-verify";
import { readMetaCreds } from "@/lib/meta.server";

const lidverkPaused = { brand_slug: "lidverk", platforms: ["facebook"], enabled: false };
const lidverkOn = { ...lidverkPaused, enabled: true };
const skyline = { brand_slug: "skyline", platforms: ["instagram", "facebook"], enabled: true };

describe("global Skyline activation cannot activate Lidverk", () => {
  it("global on + Lidverk connected but paused → no send", () =>
    expect(canSend({ globalActive: true, row: lidverkPaused, connected: true, brand: "lidverk" }, "facebook")).toBe(false));
  it("no Lidverk row at all → no send", () => expect(canSend({ globalActive: true, row: null, connected: true, brand: "lidverk" }, "facebook")).toBe(false));
  it("Skyline's row never authorises Lidverk", () => expect(canSend({ globalActive: true, row: skyline, connected: true, brand: "lidverk" }, "facebook")).toBe(false));
  it("Lidverk enabled but not connected → no send", () => expect(canSend({ globalActive: true, row: lidverkOn, connected: false, brand: "lidverk" }, "facebook")).toBe(false));
  it("Lidverk enabled + connected but global off → no send", () => expect(canSend({ globalActive: false, row: lidverkOn, connected: true, brand: "lidverk" }, "facebook")).toBe(false));
  it("Lidverk enabled + connected + global on → Facebook sends", () => expect(canSend({ globalActive: true, row: lidverkOn, connected: true, brand: "lidverk" }, "facebook")).toBe(true));
  it("Skyline unchanged: both platforms send", () => {
    expect(canSend({ globalActive: true, row: skyline, connected: false, brand: "skyline" }, "instagram")).toBe(true);
    expect(canSend({ globalActive: true, row: skyline, connected: false, brand: "skyline" }, "facebook")).toBe(true);
  });
  it("enabling requires connection and a confirmed test", () => {
    expect(enableBlocker({ connected: false, testConfirmed: true, platforms: ["facebook"] })).toMatch(/connection/);
    expect(enableBlocker({ connected: true, testConfirmed: false, platforms: ["facebook"] })).toMatch(/test/);
    expect(enableBlocker({ connected: true, testConfirmed: true, platforms: ["facebook"] })).toBeNull();
  });
});

describe("disabled Instagram", () => {
  it("Lidverk can never send to Instagram even when fully enabled", () =>
    expect(canSend({ globalActive: true, row: lidverkOn, connected: true, brand: "lidverk" }, "instagram")).toBe(false));
  it("Facebook-only needs no IG secret or IG permissions", () => {
    expect(requiredSecrets("lidverk", ["facebook"])).toEqual(["META_LIDVERK_PAGE_ACCESS_TOKEN", "META_LIDVERK_PAGE_ID"]);
    expect(requiredScopes(["facebook"]).some((s) => s.startsWith("instagram"))).toBe(false);
  });
  it("platform list must be valid", () => {
    expect(normalizePlatforms(["facebook"])).toEqual(["facebook"]);
    expect(() => normalizePlatforms([])).toThrow();
    expect(() => normalizePlatforms(["tiktok"])).toThrow();
  });
});

describe("correct brand credentials, no fallback to Skyline", () => {
  const keep = { ...process.env };
  afterEach(() => { process.env = { ...keep }; });
  it("secret names", () => {
    expect(metaSecretNames("skyline").token).toBe("META_PAGE_ACCESS_TOKEN");
    expect(metaSecretNames("lidverk").token).toBe("META_LIDVERK_PAGE_ACCESS_TOKEN");
  });
  it("Lidverk without its own secrets gets nothing, even when Skyline's exist", () => {
    process.env.META_PAGE_ACCESS_TOKEN = "sky"; process.env.META_PAGE_ID = "1"; process.env.META_IG_USER_ID = "2";
    delete process.env.META_LIDVERK_PAGE_ACCESS_TOKEN; delete process.env.META_LIDVERK_PAGE_ID;
    expect(readMetaCreds("lidverk", ["facebook"])).toBeNull();
  });
  it("Lidverk reads only its own token and page, with no IG id", () => {
    process.env.META_PAGE_ACCESS_TOKEN = "sky"; process.env.META_PAGE_ID = "1";
    process.env.META_LIDVERK_PAGE_ACCESS_TOKEN = "lid"; process.env.META_LIDVERK_PAGE_ID = "9";
    expect(readMetaCreds("lidverk", ["facebook"])).toMatchObject({ token: "lid", pageId: "9", igUserId: null });
  });
});

describe("connection check does not queue or post", () => {
  function fakeGet(pageId: string, scopes: string[]) {
    const calls: string[] = [];
    const get: GraphGet = async <T,>(path: string) => {
      calls.push(path);
      if (path === "me") return { id: pageId, name: "Lidverk" } as T;
      if (path === "debug_token") return { data: { scopes } } as T;
      return { id: pageId, name: "Lidverk" } as T;
    };
    return { get, calls };
  }
  it("Facebook-only connects with only read calls and pauses posting", async () => {
    const { get, calls } = fakeGet("9", requiredScopes(["facebook"]));
    const r = await verifyMetaConnection(get, { pageId: "9", igUserId: null, platforms: ["facebook"] });
    expect(r.status).toBe("connected");
    expect(r.message).toMatch(/paused/);
    expect(calls).toEqual(["me", "9", "debug_token"]);
  });
  it("token of another Page is rejected", async () => {
    const { get } = fakeGet("1", requiredScopes(["facebook"]));
    expect((await verifyMetaConnection(get, { pageId: "9", igUserId: null, platforms: ["facebook"] })).status).toBe("error");
  });
  it("missing page permissions is an error", async () => {
    const { get } = fakeGet("9", ["pages_show_list"]);
    expect((await verifyMetaConnection(get, { pageId: "9", igUserId: null, platforms: ["facebook"] })).message).toMatch(/pages_manage_posts/);
  });
  it("checkMetaConnection never creates publication rows", () => {
    const src = readFileSync("src/lib/app.functions.ts", "utf8");
    const body = src.slice(src.indexOf("export const checkMetaConnection"), src.indexOf("export const setBrandPlatforms"));
    expect(body).not.toMatch(/publications/);
  });
});

import { DEFAULT_PLATFORMS as DP } from "@/lib/brand-publishing";
import { BRAND_DEFAULTS as BD } from "@/lib/strategy";
describe("Norge business", () => {
  it("exists as its own business and defaults to Instagram only", () => {
    expect(BD.some((b) => b.slug === "norge" && b.name === "Norge")).toBe(true);
    expect(DP.norge).toEqual(["instagram"]);
  });
});
