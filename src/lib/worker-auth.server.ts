/** Verifies the local render worker's bearer secret (constant-time compare). */
export function workerDenied(request: Request): Response | null {
  const secret = process.env["WORKER_SECRET"];
  if (!secret) return new Response("Server configuration error", { status: 500 });
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  let diff = token.length ^ secret.length;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ (token.charCodeAt(i % Math.max(token.length, 1)) || 0);
  return diff === 0 ? null : new Response("Unauthorized", { status: 401 });
}
