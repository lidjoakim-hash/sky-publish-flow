import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Film, Image as ImageIcon } from "lucide-react";
import { assetsQuery } from "@/lib/queries";
import { osloDateKey } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/next")({
  head: () => ({
    meta: [
      { title: "Up next — Skyline Publisher" },
      { name: "description", content: "The next scheduled posts and Reels, with exact times." },
      { property: "og:title", content: "Up next — Skyline Publisher" },
      { property: "og:description", content: "The next scheduled posts and Reels, with exact times." },
    ],
  }),
  component: NextPage,
});

const time = (iso: string) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayLabel = (iso: string, today: string, tomorrow: string) => {
  const k = osloDateKey(iso);
  if (k === today) return "Today";
  if (k === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Oslo", weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
};

function NextPage() {
  const { data: assets = [] } = useQuery({ ...assetsQuery, refetchInterval: 60000 });
  const now = Date.now();
  const today = osloDateKey(new Date());
  const tomorrow = osloDateKey(new Date(now + 86400000));

  const days = useMemo(() => {
    const upcoming = assets
      .filter((a) => !a.skipped && a.scheduled_at && new Date(a.scheduled_at).getTime() >= now - 5 * 60000)
      .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))
      .slice(0, 40);
    const map = new Map<string, typeof upcoming>();
    for (const a of upcoming) {
      const k = osloDateKey(a.scheduled_at!);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  const first = days[0]?.[0];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">Up next</h1>
      {first ? (
        <div className="mt-4 rounded-2xl bg-sidebar p-5 text-sidebar-accent-foreground shadow-card sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Next to go out</div>
          <div className="mt-1 font-display text-4xl font-bold sm:text-5xl">{time(first.scheduled_at!)}</div>
          <div className="mt-1 text-sm opacity-90">{dayLabel(first.scheduled_at!, today, tomorrow)} · {first.kind === "reel" ? "Reel" : "Image post"}</div>
          <div className="mt-2 truncate text-sm opacity-80">{first.file_name}</div>
        </div>
      ) : (
        <p className="mt-6 rounded-xl border bg-card p-6 text-center text-muted-foreground">Nothing is scheduled yet.</p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {days.map((items) => (
          <section key={items[0].id} className="rounded-2xl border bg-card p-4 shadow-card">
            <h2 className="mb-3 font-display text-lg font-semibold">{dayLabel(items[0].scheduled_at!, today, tomorrow)}</h2>
            <ul className="space-y-2">
              {items.map((a) => (
                <li key={a.id} className={cn("flex items-center gap-3 rounded-xl p-3", a.kind === "reel" ? "bg-teal/10" : "bg-muted")}>
                  <span className="w-14 shrink-0 font-display text-xl font-bold tabular-nums">{time(a.scheduled_at!)}</span>
                  {a.kind === "reel" ? <Film className="size-5 shrink-0 text-teal" /> : <ImageIcon className="size-5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{a.kind === "reel" ? "Reel" : "Image post"}{a.approved ? "" : " · not approved"}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.file_name}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
