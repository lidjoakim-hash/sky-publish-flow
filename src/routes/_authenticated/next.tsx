import { useBrandAssets, useBrandPublications } from "@/components/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { type Asset } from "@/lib/queries";
import { osloDateKey } from "@/lib/schedule";
import { runway } from "@/lib/upnext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NextCalendar } from "@/components/next-calendar";
import { AssetPreviewDialog } from "@/components/asset-preview";
import { addDays, calendarItems } from "@/lib/next-calendar";

export const Route = createFileRoute("/_authenticated/next")({
  head: () => ({
    meta: [
      { title: "Up next — Skyline Publisher" },
      { name: "description", content: "The next scheduled posts and Reels, with exact times." },
      { property: "og:title", content: "Up next — Skyline Publisher" },
      { property: "og:description", content: "The next scheduled posts and Reels, with exact times." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NextPage,
});

const time = (iso: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const longDate = (key: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(key + "T12:00:00Z"));
const dayLabel = (iso: string, today: string, tomorrow: string) => {
  const k = osloDateKey(iso);
  if (k === today) return "Today";
  if (k === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
};

function NextPage() {
  const { data: assets = [], slug } = useBrandAssets({ refetchInterval: 60000 });
  const { data: pubs = [] } = useBrandPublications({ refetchInterval: 60000 });
  const [open, setOpen] = useState<Asset | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setOpen(null), [slug]);
  const today = osloDateKey(new Date(now));
  const tomorrow = addDays(today, 1);
  const run = useMemo(() => runway(assets, today, osloDateKey, now), [assets, today, now]);
  const days = useMemo(() => calendarItems(assets, slug), [assets, slug]);
  const first = [...days.values()].flat().find((a) => a.scheduled_at && new Date(a.scheduled_at).getTime() >= now && !pubs.some((p) => p.asset_id === a.id && p.status === "published"));
  const imbalance = run.days > 0 && run.postDays !== run.reelDays
    ? run.postDays < run.reelDays ? "Image posts run out before Reels." : "Reels run out before image posts." : null;

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h1 className="min-w-0 font-display text-xl font-bold sm:text-3xl">Up next</h1>
        <Button variant="link" asChild className="min-h-11 max-w-36 px-0 text-right text-xs whitespace-normal sm:max-w-none sm:text-sm"><Link to="/health">Check all businesses</Link></Button>
      </div>
      <div className="mt-2 grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
        <div className={cn("min-w-0 rounded-lg border p-3", run.days <= 7 ? "border-warning bg-warning/10" : "bg-card")}>
          <div className="font-display text-2xl font-bold tabular-nums sm:text-3xl">{run.days} <span className="text-sm font-semibold">{run.days === 1 ? "day" : "days"} left</span></div>
          <div className="mt-1 text-xs text-muted-foreground">{run.postsLeft} posts · {run.reelsLeft} Reels</div>
          <div className="mt-1 text-xs text-muted-foreground">{run.lastKey ? `Until ${longDate(run.lastKey)}` : "Nothing scheduled"}</div>
        </div>
        {first?.scheduled_at ? <Button variant="default" onClick={() => setOpen(first)} className="block h-auto min-w-0 rounded-lg p-3 text-left whitespace-normal">
          <div className="text-xs font-medium opacity-80">Next to go out</div>
          <div className="font-display text-2xl font-bold tabular-nums sm:text-3xl">{time(first.scheduled_at)}</div>
          <div className="mt-1 text-xs">{dayLabel(first.scheduled_at, today, tomorrow)} · {first.kind === "reel" ? "Reel" : "Image post"}</div>
          <div className="mt-1 truncate text-xs opacity-80">{first.file_name}</div>
        </Button> : <div className="flex min-w-0 items-center rounded-lg bg-muted p-3 text-sm text-muted-foreground">No upcoming items.</div>}
      </div>
      {imbalance && <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-foreground"><AlertTriangle className="size-3.5 shrink-0" />{imbalance}</p>}
      <NextCalendar key={slug} days={days} pubs={pubs} today={today} onPreview={setOpen} />
      <AssetPreviewDialog asset={open} assets={assets} pubs={pubs} onClose={() => setOpen(null)} withActions />
    </div>
  );
}
