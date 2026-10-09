/**
 * Pure per-business publishing rules (no I/O). Each business has an explicit platform list and
 * its own enable switch; the global settings.publishing_active switch is necessary but never sufficient.
 */
export type Platform = "instagram" | "facebook";
export const ALL_PLATFORMS: Platform[] = ["instagram", "facebook"];

export interface BrandPublishing {
  brand_slug: string;
  platforms: string[];
  enabled: boolean;
}

/**
 * How a business connects to Meta. "facebook_login": Page token on graph.facebook.com (existing businesses).
 * "instagram_login": Instagram API with Instagram Login on graph.instagram.com — no Facebook Page.
 */
export type ConnectionMode = "facebook_login" | "instagram_login";
export const INSTAGRAM_LOGIN_BRANDS: Record<string, { expectedUsername: string }> = { norge: { expectedUsername: "norge_no" } };
export function connectionMode(brand: string): ConnectionMode {
  return brand in INSTAGRAM_LOGIN_BRANDS ? "instagram_login" : "facebook_login";
}
/** Platforms a business may ever use. Instagram-Login businesses have no Page, so Facebook is impossible. */
export function allowedPlatforms(brand: string): Platform[] {
  return connectionMode(brand) === "instagram_login" ? ["instagram"] : ALL_PLATFORMS;
}
export const INSTAGRAM_LOGIN_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
/** Secrets for an Instagram-Login business: an Instagram user token and the IG account id. No Page. */
export function instagramLoginSecretNames(brand: string) {
  const p = `META_${brand.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
  return { token: `${p}IG_ACCESS_TOKEN`, igUserId: `${p}IG_USER_ID` };
}

/** Secret names per business. Skyline keeps the original names; others use META_<SLUG>_*. Never falls back across businesses. */
export function metaSecretNames(brand: string) {
  const p = brand === "skyline" ? "META_" : `META_${brand.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
  return { token: `${p}PAGE_ACCESS_TOKEN`, pageId: `${p}PAGE_ID`, igUserId: `${p}IG_USER_ID` };
}

/** Secrets a business needs for its chosen platforms (no IG secret for Facebook-only businesses). */
export function requiredSecrets(brand: string, platforms: readonly string[]): string[] {
  if (connectionMode(brand) === "instagram_login") { const n = instagramLoginSecretNames(brand); return [n.token, n.igUserId]; }
  const n = metaSecretNames(brand);
  return platforms.includes("instagram") ? [n.token, n.pageId, n.igUserId] : [n.token, n.pageId];
}

/** Token permissions needed for the chosen platforms. */
export function requiredScopes(platforms: readonly string[], brand?: string): string[] {
  if (brand && connectionMode(brand) === "instagram_login") return INSTAGRAM_LOGIN_SCOPES;
  const fb = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
  return platforms.includes("instagram") ? [...fb, "instagram_basic", "instagram_content_publish"] : fb;
}

/** Defaults when a business has no explicit row yet: nothing enabled, platform list must be chosen. */
export const DEFAULT_PLATFORMS: Record<string, Platform[]> = { skyline: ["instagram", "facebook"], lidverk: ["facebook"], norge: ["instagram"] };

export function normalizePlatforms(p: unknown, brand?: string): Platform[] {
  if (!Array.isArray(p)) throw new Error("Choose at least one platform");
  const allowed = brand ? allowedPlatforms(brand) : ALL_PLATFORMS;
  const out = allowed.filter((x) => p.includes(x));
  if (!out.length || out.length !== new Set(p).size) throw new Error(brand && connectionMode(brand) === "instagram_login" ? "This business posts to Instagram only (no Facebook Page)." : "Choose at least one valid platform");
  return out;
}

/**
 * May this business send to this platform right now? Requires: global switch on, the business's own
 * switch on, the platform chosen for it, and (except legacy Skyline) its own connection checked.
 */
export function canSend(
  o: { globalActive: boolean; row: BrandPublishing | null | undefined; connected: boolean; brand: string },
  platform: string,
): boolean {
  if (!o.globalActive || !o.row || o.row.brand_slug !== o.brand || !o.row.enabled) return false;
  if (!o.row.platforms.includes(platform)) return false;
  if (!(allowedPlatforms(o.brand) as string[]).includes(platform)) return false;
  return o.brand === "skyline" || o.connected;
}

/** Why a business cannot be enabled yet (null = can enable). */
export function enableBlocker(o: { connected: boolean; testConfirmed: boolean; platforms: readonly string[] }): string | null {
  if (!o.platforms.length) return "Choose which platforms this business posts to first.";
  if (!o.connected) return "Check the connection first — it must say Connected.";
  if (!o.testConfirmed) return "Confirm you reviewed a draft or non-public test post first.";
  return null;
}
