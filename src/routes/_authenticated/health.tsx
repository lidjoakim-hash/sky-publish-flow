import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { assetsQuery, brandPublishingQuery, brandsQuery, connectionQuery, publicationsQuery, settingsQuery } from "@/lib/queries";
import { brandHealth } from "@/lib/health";
import { cn } from "@/lib/utils";
import { visibleBrands } from "@/components/brand";

export const Route = createFileRoute("/_authenticated/health")({
  head: () => ({
    meta: [
      { title: "All businesses check — Skyline Publisher" },
      { name: "description", content: "One-page check of every business: missed, failed or unchecked posts." },
      { property: "og:title", content: "All businesses check — Skyline Publisher" },
      { property: "og:description", content: "One-page check of every business: missed, failed or unchecked posts." },
    ],
  }),
  component: HealthPage,
});

const HOUR = 3_600_000;
const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function HealthPage() {
  // Plain reads of saved data, refreshed once an hour while open. No AI, no Meta calls.
  const opt = { refetchInterval: HOUR };
  const { data: brands = [] } = useQuery({ ...brandsQuery, ...opt });
  const { data: assets = [], dataUpdatedAt } = useQuery({ ...assetsQuery, ...opt });
  const { data: pubs = [] } = useQuery({ ...publicationsQuery, ...opt });
  const { data: conns = [] } = useQuery({ ...connectionQuery, ...opt });
  const { data: bp = [] } = useQuery({ ...brandPublishingQuery, ...opt });
  const { data: settings } = useQuery({ ...settingsQuery, ...opt });
  const now = Date.now();
  const rows = visibleBrands(brands).map((b) => {
    const row = bp.find((r) => r.brand_slug === b.slug);
    const conn = Array.isArray(conns) ? conns.find((c) => c.brand_slug === b.slug) : undefined;
    return { name: b.name, h: brandHealth(b.slug, assets, pubs, { connected: conn?.status === "connected", postingOn: !!settings?.publishing_active && !!row?.enabled, now }) };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">All businesses</h1>
        <Link to="/next" className="text-sm text-primary underline">Back to Up next</Link>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Checked {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }) : "—"} · rechecks every hour while this page is open · uses no credits.
      </p>
      <div className="mt-4 space-y-3">
        {rows.map(({ name, h }) => {
          const ok = !h.problems.length;
          return (
            <div key={h.slug} className={cn("rounded-2xl border p-4 shadow-card", ok ? "bg-card" : "border-warning bg-warning/10")}>
              <div className="flex items-center gap-2">
                {ok ? <CheckCircle2 className="size-5 text-success" /> : <AlertTriangle className="size-5 text-warning" />}
                <span className="font-semibold">{name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{h.postingOn ? "Posting on" : "Paused"} · {h.connected ? "Connected" : "Not connected"}</span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Next: {h.nextAt ? fmt(h.nextAt) : "nothing scheduled"} · {h.daysLeft} day(s) of content
              </div>
              {ok ? <div className="mt-1 text-sm">Everything looks okay.</div> : (
                <ul className="mt-2 list-disc pl-5 text-sm">{h.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
