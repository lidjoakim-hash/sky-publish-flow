/** Minimal Meta Graph API client (server only). Credentials come from project secrets. */
export interface MetaCreds {
  token: string;
  pageId: string;
  igUserId: string;
  version: string;
}

export function readMetaCreds(): MetaCreds | null {
  const token = process.env["META_PAGE_ACCESS_TOKEN"];
  const pageId = process.env["META_PAGE_ID"];
  const igUserId = process.env["META_IG_USER_ID"];
  if (!token || !pageId || !igUserId) return null;
  return { token, pageId, igUserId, version: process.env["META_GRAPH_VERSION"] || "v23.0" };
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
  const url = new URL(`https://graph.facebook.com/${c.version}/${path.replace(/^\//, "")}`);
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
