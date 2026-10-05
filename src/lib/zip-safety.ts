/** ZIP entry validation: rejects path traversal, absolute paths and decompression bombs. */
export const ZIP_LIMITS = {
  maxEntryBytes: 600 * 1024 * 1024,
  maxTotalBytes: 4 * 1024 * 1024 * 1024,
  maxRatio: 200,
  maxEntries: 5000,
};

export function validateEntryPath(name: string): string | null {
  const n = name.replace(/\\/g, "/");
  if (!n || n.includes("\0")) return null;
  if (n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return null;
  const parts = n.split("/");
  if (parts.some((p) => p === "..")) return null;
  return parts.filter((p) => p && p !== ".").join("/");
}

export function checkBomb(compressed: number, uncompressed: number, runningTotal: number): string | null {
  if (uncompressed > ZIP_LIMITS.maxEntryBytes) return "Entry is larger than the per-file limit";
  if (runningTotal + uncompressed > ZIP_LIMITS.maxTotalBytes) return "Archive expands beyond the safe total size";
  if (compressed > 0 && uncompressed / compressed > ZIP_LIMITS.maxRatio && uncompressed > 10 * 1024 * 1024)
    return "Suspicious compression ratio (possible decompression bomb)";
  return null;
}
