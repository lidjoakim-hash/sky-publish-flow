import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, PubBadge } from "@/components/app-ui";
import { assetsQuery, publicationsQuery, signedUrl, type Publication } from "@/lib/queries";
import { formatOslo } from "@/lib/schedule";
import { resolvePublication } from "@/lib/app.functions";
import { MissedPanel } from "@/components/missed";

export const Route = createFileRoute("/_authenticated/results")({
  head: () => ({ meta: [{ title: "Publishing results — Skyline Publisher" }, { name: "description", content: "Instagram and Facebook results per item." }, { property: "og:title", content: "Publishing results — Skyline Publisher" }, { property: "og:description", content: "Instagram and Facebook results per item." }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const qc = useQueryClient();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: pubs = [] } = useQuery({ ...publicationsQuery, refetchInterval: 15000 });
  const resolve = useServerFn(resolvePublication);
  const rows = useMemo(() => {
    const by = new Map<string, Publication[]>();
    for (const p of pubs) by.set(p.asset_id, [...(by.get(p.asset_id) ?? []), p]);
    return assets.filter((a) => by.has(a.id)).map((a) => ({ a, pubs: by.get(a.id)! })).sort((x, y) => (x.a.scheduled_at ?? "").localeCompare(y.a.scheduled_at ?? ""));
  }, [assets, pubs]);

  async function act(id: string, outcome: "published" | "retry" | "skip") {
    let permalink: string | undefined;
    if (outcome === "published") permalink = window.prompt("Paste the post link (optional)") ?? undefined;
    await resolve({ data: { id, outcome, permalink } });
    toast.success("Updated.");
    qc.invalidateQueries({ queryKey: ["publications"] });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Publishing results" subtitle="Instagram and Facebook are tracked separately. “Published” is shown only after Meta confirms it." />
      <MissedPanel assets={assets} pubs={pubs} />
      {!rows.length ? <Empty>Nothing queued yet. Items appear here after you activate publishing.</Empty> : (
        <div className="space-y-3">
          {rows.map(({ a, pubs }) => (
            <div key={a.id} className="rounded-xl border bg-card p-4 shadow-card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{a.file_name}</span>
                <span className="text-sm text-muted-foreground">{a.scheduled_at ? formatOslo(a.scheduled_at) : ""}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["instagram", "facebook"] as const).map((pl) => {
                  const p = pubs.find((x) => x.platform === pl);
                  return (
                    <div key={pl} className="rounded-lg bg-muted p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{pl === "instagram" ? "Instagram" : "Facebook"}</span>
                        <PubBadge status={p?.status} />
                      </div>
                      {p && <div className="mt-1 text-xs text-muted-foreground">Attempts: {p.attempts}{p.remote_id ? ` · ID ${p.remote_id}` : ""}</div>}
                      {p?.last_error && <div className="mt-1 text-xs text-destructive">{p.last_error}</div>}
                      {p?.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-teal underline">Open post <ExternalLink className="size-3" /></a>}
                      {p?.status === "needs_finish" && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={async () => { const path = a.rendered_path ?? a.storage_path; const url = path ? await signedUrl(path) : null; if (url) window.open(url, "_blank"); else toast.error("File not available"); }}>Download Reel</Button>
                          <Button size="sm" variant="teal" onClick={() => act(p.id, "published")}>I posted it in Instagram</Button>
                          <Button size="sm" variant="ghost" onClick={() => act(p.id, "skip")}>Skip</Button>
                        </div>
                      )}
                      {p && (p.status === "unknown" || p.status === "failed") && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.status === "unknown" && <Button size="sm" variant="outline" onClick={() => act(p.id, "published")}>It is live</Button>}
                          <Button size="sm" variant="outline" onClick={() => act(p.id, "retry")}>{p.status === "unknown" ? "Not live – send again" : "Try again"}</Button>
                          <Button size="sm" variant="ghost" onClick={() => act(p.id, "skip")}>Skip</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
