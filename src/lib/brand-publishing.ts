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

/** Secret names per business. Skyline keeps the original names; others use META_<SLUG>_*. Never falls back across businesses. */
export function metaSecretNames(brand: string) {
  const p = brand === "skyline" ? "META_" : `META_${brand.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
  return { token: `${p}PAGE_ACCESS_TOKEN`, pageId: `${p}PAGE_ID`, igUserId: `${p}IG_USER_ID` };
}

/** Secrets a business needs for its chosen platforms (no IG secret for Facebook-only businesses). */
export function requiredSecrets(brand: string, platforms: readonly string[]): string[] {
  const n = metaSecretNames(brand);
  return platforms.includes("instagram") ? [n.token, n.pageId, n.igUserId] : [n.token, n.pageId];
}

/** Token permissions needed for the chosen platforms. */
export function requiredScopes(platforms: readonly string[]): string[] {
  const fb = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
  return platforms.includes("instagram") ? [...fb, "instagram_basic", "instagram_content_publish"] : fb;
}

/** Defaults when a business has no explicit row yet: nothing enabled, platform list must be chosen. */
export const DEFAULT_PLATFORMS: Record<string, Platform[]> = { skyline: ["instagram", "facebook"], lidverk: ["facebook"] };

export function normalizePlatforms(p: unknown): Platform[] {
  if (!Array.isArray(p)) throw new Error("Choose at least one platform");
  const out = ALL_PLATFORMS.filter((x) => p.includes(x));
  if (!out.length || out.length !== new Set(p).size) throw new Error("Choose at least one valid platform");
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
  return o.brand === "skyline" || o.connected;
}

/** Why a business cannot be enabled yet (null = can enable). */
export function enableBlocker(o: { connected: boolean; testConfirmed: boolean; platforms: readonly string[] }): string | null {
  if (!o.platforms.length) return "Choose which platforms this business posts to first.";
  if (!o.connected) return "Check the connection first — it must say Connected.";
  if (!o.testConfirmed) return "Confirm you reviewed a draft or non-public test post first.";
  return null;
}
