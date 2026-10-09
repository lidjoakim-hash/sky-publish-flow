/** Minimal Meta Graph API client (server only). Credentials come from project secrets. */
import { connectionMode, instagramLoginSecretNames, metaSecretNames } from "./brand-publishing";
export interface MetaCreds {
  token: string;
  pageId: string;
  igUserId: string | null;
  version: string;
  /** graph.facebook.com for Page tokens; graph.instagram.com for Instagram-Login tokens. */
  host: "graph.facebook.com" | "graph.instagram.com";
}

export { metaSecretNames };

/**
 * Reads ONLY this business's secrets — never another business's. The Instagram id is required
 * only when the business posts to Instagram.
 */
export function readMetaCreds(brand = "skyline", platforms: readonly string[] = ["instagram", "facebook"]): MetaCreds | null {
  if (connectionMode(brand) === "instagram_login") {
    if (!platforms.includes("instagram")) return null;
    const m = instagramLoginSecretNames(brand);
    const t = process.env[m.token], ig = process.env[m.igUserId];
    if (!t || !ig) return null;
    return { token: t, pageId: "", igUserId: ig, version: process.env["META_GRAPH_VERSION"] || "v23.0", host: "graph.instagram.com" };
  }
  const n = metaSecretNames(brand);
  const token = process.env[n.token];
  const pageId = process.env[n.pageId];
  const igUserId = platforms.includes("instagram") ? process.env[n.igUserId] : undefined;
  if (!token || !pageId) return null;
  if (platforms.includes("instagram") && !igUserId) return null;
  return { token, pageId, igUserId: igUserId ?? null, version: process.env["META_GRAPH_VERSION"] || "v23.0", host: "graph.facebook.com" };
}

export class MetaError extends Error {
  constructor(
    message: string,
    public kind: "auth" | "transient" | "permanent" | "unknown",
    public code?: number,
  ) {
    super(message);
  }
}

function classify(status: number, err: { code?: number; error_subcode?: number; message?: string; is_transient?: boolean }): MetaError["kind"] {
  if (err.code === 190 || err.code === 102 || err.code === 10 || (err.code ?? 0) >= 200 && (err.code ?? 0) < 300) return "auth";
  if (err.is_transient || [1, 2, 4, 17, 32, 341, 613, 9007].includes(err.code ?? -1) || status >= 500) return "transient";
  return "permanent";
}

export async function graph<T = Record<string, unknown>>(
  c: MetaCreds,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string | undefined> = {},
): Promise<T> {
  const url = new URL(`https://${c.host ?? "graph.facebook.com"}/${c.version}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) (method === "GET" ? url.searchParams : body).set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${c.token}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: method === "POST" ? body : undefined,
    });
  } catch (e) {
    // Network failure: for POSTs the outcome is unknown.
    throw new MetaError(`Network error: ${(e as Error).message}`, method === "POST" ? "unknown" : "transient");
  }
  const text = await res.text();
  let json: { error?: { code?: number; message?: string; error_subcode?: number; is_transient?: boolean } } & Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new MetaError(`Unexpected response [${res.status}]`, method === "POST" && res.status >= 500 ? "unknown" : "transient");
  }
  if (!res.ok || json.error) {
    const err = json.error ?? {};
    throw new MetaError(`Meta [${res.status}] ${err.message ?? text.slice(0, 200)}`, classify(res.status, err), err.code);
  }
  return json as T;
}

/** Facebook Reels hosted-file upload step (rupload). */
export async function ruploadFromUrl(c: MetaCreds, videoId: string, fileUrl: string) {
  let res: Response;
  try {
    res = await fetch(`https://rupload.facebook.com/video-upload/${c.version}/${videoId}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${c.token}`, file_url: fileUrl },
    });
  } catch (e) {
    throw new MetaError(`Network error: ${(e as Error).message}`, "unknown");
  }
  const text = await res.text();
  if (!res.ok) throw new MetaError(`Upload [${res.status}] ${text.slice(0, 200)}`, res.status >= 500 ? "transient" : "permanent");
}
