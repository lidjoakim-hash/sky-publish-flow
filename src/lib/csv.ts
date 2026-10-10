/** RFC 4180 CSV parser: quoted fields, escaped quotes, multiline values, BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export interface CaptionRow {
  asset: string;
  type: string;
  caption: string;
}

/**
 * Parses a caption CSV (case-insensitive headers). Accepts "Asset,Type,Caption" and creator exports
 * "Path,File,Type,Caption" (non-empty Path preferred, File as fallback). Throws a readable error when
 * the caption column or every path column is missing.
 */
export function parseCaptionCsv(text: string): CaptionRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const pi = header.indexOf("path");
  const fi = header.indexOf("file");
  const ai = header.indexOf("asset");
  const ti = header.indexOf("type");
  const ci = header.indexOf("caption");
  if (ci < 0 || (ai < 0 && pi < 0 && fi < 0))
    throw new Error("Caption CSV needs a Caption column and an Asset, Path or File column");
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return rows.slice(1).map((r) => ({
    asset: cell(r, pi) || cell(r, fi) || cell(r, ai),
    type: cell(r, ti),
    caption: r[ci] ?? "",
  }));
}
