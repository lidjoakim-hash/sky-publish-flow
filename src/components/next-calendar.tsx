import { CalendarDays, ChevronLeft, ChevronRight, Film, Image as ImageIcon, List, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { monthDays, moveMonth, preparationLabels, publicationLabel } from "@/lib/next-calendar";
import type { Asset, Publication } from "@/lib/queries";

const dateName = (key: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(key + "T12:00:00Z"));
const monthName = (key: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(key + "T12:00:00Z"));
const time = (iso: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function NextCalendar({ days, pubs, today, onPreview }: { days: Map<string, Asset[]>; pubs: Publication[]; today: string; onPreview: (a: Asset) => void }) {
  const [mode, setMode] = useState("calendar");
  const [month, setMonth] = useState(today.slice(0, 7) + "-01");
  const [selected, setSelected] = useState(today);
  const monthEntries = [...days.entries()].filter(([key]) => key.startsWith(month.slice(0, 7)));
  const items = monthEntries.flatMap(([, xs]) => xs);
  const posts = items.filter((a) => a.kind === "post").length;
  const reels = items.filter((a) => a.kind === "reel").length;
  const selectedItems = days.get(selected) ?? [];
  const pubsByAsset = new Map<string, Publication[]>();
  for (const p of pubs) pubsByAsset.set(p.asset_id, [...(pubsByAsset.get(p.asset_id) ?? []), p]);
  function navigate(n: number) {
    const next = moveMonth(month, n);
    setMonth(next);
    setSelected(next);
  }
  function select(key: string) { setSelected(key); setMonth(key.slice(0, 7) + "-01"); }

  function agenda(key: string, xs: Asset[]) {
    return <section key={key} className="min-w-0" aria-label={dateName(key)}>
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <h2 className="min-w-0 font-display text-base font-bold sm:text-lg">{dateName(key)}</h2>
        <span className="shrink-0 text-xs text-muted-foreground">{xs.length} {xs.length === 1 ? "item" : "items"}</span>
      </div>
      {!xs.length ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled for this day.</p> : <ul className="space-y-2">
        {xs.map((a) => {
          const records = pubsByAsset.get(a.id) ?? [];
          const labels = preparationLabels(a, records.map((p) => p.status));
          return <li key={a.id}>
            <Button variant="ghost" onClick={() => onPreview(a)} className="grid h-auto min-h-11 w-full grid-cols-[3rem_minmax(0,1fr)] items-start gap-2 rounded-lg border bg-card px-3 py-3 text-left whitespace-normal sm:grid-cols-[4rem_minmax(0,1fr)]">
              <span className="font-display text-lg font-bold tabular-nums">{a.scheduled_at ? time(a.scheduled_at) : ""}</span>
              <div className="min-w-0 space-y-1">
                <div className={cn("flex items-center gap-1.5 text-sm font-semibold", a.kind === "reel" ? "text-teal" : "text-post")}>{a.kind === "reel" ? <Film className="size-4 shrink-0" /> : <ImageIcon className="size-4 shrink-0" />}{a.kind === "reel" ? "Reel" : "Image post"}</div>
                <div className="text-sm font-medium [overflow-wrap:anywhere]">{a.file_name}</div>
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs font-normal">
                  <span className={a.approved ? "text-muted-foreground" : "text-warning-foreground"}>{labels.approval}</span>
                  {labels.ready && <span className="text-success">Ready to publish</span>}
                  {labels.issues.map((issue) => <span key={issue} className="inline-flex min-w-0 items-start gap-1 text-warning-foreground"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{issue}</span>)}
                </div>
                <div className="space-y-0.5 text-xs font-normal text-muted-foreground">
                  {records.length ? records.map((p) => <div key={p.id} className={cn("[overflow-wrap:anywhere]", ["missed", "unknown", "failed"].includes(p.status) && "text-destructive")}>{p.platform === "instagram" ? "Instagram" : "Facebook"}: {publicationLabel(p.status)}</div>) : <div>Not queued</div>}
                </div>
              </div>
            </Button>
          </li>;
        })}
      </ul>}
    </section>;
  }

  return <div className="mt-4 min-w-0">
    <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="group" aria-label="Schedule view">
      <Button variant={mode === "calendar" ? "default" : "ghost"} className="min-h-11" aria-pressed={mode === "calendar"} onClick={() => setMode("calendar")}><CalendarDays />Calendar</Button>
      <Button variant={mode === "agenda" ? "default" : "ghost"} className="min-h-11" aria-pressed={mode === "agenda"} onClick={() => setMode("agenda")}><List />Agenda</Button>
    </div>
    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
      <h2 className="min-w-0 font-display text-base font-bold sm:text-xl" aria-live="polite">{monthName(month)}</h2>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="outline" className="min-h-11 px-2 text-xs sm:px-3" onClick={() => select(today)}>Today</Button>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Previous month" title="Previous month" onClick={() => navigate(-1)}><ChevronLeft /></Button>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Next month" title="Next month" onClick={() => navigate(1)}><ChevronRight /></Button>
      </div>
    </div>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium" aria-label="Calendar legend and month totals">
      <span className="flex items-center gap-1 text-post"><ImageIcon className="size-3.5" />{posts} image posts</span>
      <span className="flex items-center gap-1 text-teal"><Film className="size-3.5" />{reels} Reels</span>
      <span className="text-muted-foreground">{monthEntries.length} scheduled days · Oslo time</span>
    </div>
    {mode === "calendar" ? <>
      <div className="mt-3" role="group" aria-label={monthName(month) + " calendar"}>
        <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {monthDays(month).map((key) => {
            const xs = days.get(key) ?? [];
            const pc = xs.filter((a) => a.kind === "post").length;
            const rc = xs.filter((a) => a.kind === "reel").length;
            const warning = xs.some((a) => !a.approved || preparationLabels(a, []).issues.length || (pubsByAsset.get(a.id) ?? []).some((p) => ["unknown", "failed", "missed"].includes(p.status)));
            return <Button key={key} variant="ghost" aria-label={`${dateName(key)}${key === today ? ", today" : ""}, ${pc} image posts, ${rc} Reels${warning ? ", needs attention" : ""}`} aria-pressed={key === selected} aria-current={key === today ? "date" : undefined} onClick={() => select(key)} className={cn("relative flex h-[68px] min-w-0 flex-col justify-start gap-1 rounded-md border border-transparent px-0 py-2 sm:h-20", !key.startsWith(month.slice(0, 7)) && "opacity-45", key === today && "border-teal", key === selected && "border-primary bg-primary/10 ring-1 ring-primary")}>
              <span className={cn("text-sm tabular-nums", key === today && "font-bold text-teal")}>{Number(key.slice(8))}</span>
              <span className="flex h-3 items-center justify-center gap-1 text-[10px]" aria-hidden="true">{pc > 0 && <span className="flex items-center gap-0.5 text-post"><span className="size-1.5 rounded-full bg-post" />{pc > 9 ? "9+" : pc}</span>}{rc > 0 && <span className="flex items-center gap-0.5 text-teal"><span className="size-1.5 rounded-full bg-teal" />{rc > 9 ? "9+" : rc}</span>}</span>
              {warning && <AlertTriangle aria-hidden="true" className="absolute bottom-1 size-2.5 text-warning-foreground" />}
            </Button>;
          })}
        </div>
      </div>
      <div className="mt-4 border-t pt-4">{agenda(selected, selectedItems)}</div>
    </> : <div className="mt-4 space-y-6 border-t pt-4">{monthEntries.length ? monthEntries.map(([key, xs]) => agenda(key, xs)) : <p className="py-8 text-center text-sm text-muted-foreground">Nothing scheduled in {monthName(month)}.</p>}</div>}
  </div>;
}