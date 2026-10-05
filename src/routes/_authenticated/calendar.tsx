import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, PauseCircle, PlayCircle, Wand2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Empty, PageHeader, Panel, PubBadge } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { assetsQuery, publicationsQuery, settingsQuery, connectionQuery } from "@/lib/queries";
import { addDays, formatOslo, osloDateKey } from "@/lib/schedule";
import { planSchedule, lockedAssetIds } from "@/lib/plan";
import { readiness } from "./library";
import { activatePublishing } from "@/lib/app.functions";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Skyline Publisher" }, { name: "description", content: "Plan and review the publishing schedule." }, { property: "og:title", content: "Calendar — Skyline Publisher" }, { property: "og:description", content: "Plan and review the publishing schedule." }] }),
  component: CalendarPage,
});

function CalendarPage() {
  const qc = useQueryClient();
  const { data: assets = [] } = useQuery(assetsQuery);
  const { data: pubs = [] } = useQuery(publicationsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const { data: conn } = useQuery(connectionQuery);
  const activate = useServerFn(activatePublishing);
  const tomorrow = addDays(osloDateKey(new Date()), 1);
  const [start, setStart] = useState(tomorrow);
  const [postTime, setPostTime] = useState("18:00");
  const [reelTime, setReelTime] = useState("19:00");
  const [mixing, setMixing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [month, setMonth] = useState(osloDateKey(new Date()).slice(0, 7));

  useEffect(() => {
    if (!settings) return;
    if (settings.start_date && settings.start_date > osloDateKey(new Date())) setStart(settings.start_date);
    setPostTime(settings.post_time.slice(0, 5));
    setReelTime(settings.reel_time.slice(0, 5));
    setMixing(settings.topic_mixing);
  }, [settings]);

  const scheduled = useMemo(() => assets.filter((a) => a.scheduled_at && !a.skipped).sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!)), [assets]);
  const pubBy = useMemo(() => {
    const m = new Map<string, Record<string, string>>();
    for (const p of pubs) m.set(p.asset_id, { ...(m.get(p.asset_id) ?? {}), [p.platform]: p.status });
    return m;
  }, [pubs]);
  const locked = useMemo(() => lockedAssetIds(pubs), [pubs]);
  const now = new Date();
  const missed = scheduled.filter((a) => new Date(a.scheduled_at!) < now && !locked.has(a.id));
  const unapprovedReady = scheduled.filter((a) => !a.approved && readiness(a).every((r) => r.startsWith("Seasonal")));
  const notReady = scheduled.filter((a) => readiness(a).some((r) => !r.startsWith("Seasonal")));

  async function saveSettings() {
    if (!settings) return;
    await supabase.from("settings").update({ start_date: start, post_time: postTime, reel_time: reelTime, topic_mixing: mixing, updated_at: new Date().toISOString() }).eq("user_id", settings.user_id);
  }

  async function apply(mode: "append" | "reschedule" | "missed") {
    if (start <= osloDateKey(new Date()) && mode !== "missed") return toast.error("Choose a future start date.");
    await saveSettings();
    const plan = planSchedule({ assets, pubs, startDate: mode === "missed" ? tomorrow : start, postTime, reelTime, timeZone: settings?.timezone ?? "Europe/Oslo", topicMixing: mixing, mode });
    if (!plan.size) return toast("Nothing to schedule.");
    const entries = [...plan];
    for (let i = 0; i < entries.length; i += 25) {
      await Promise.all(entries.slice(i, i + 25).map(([id, at]) => supabase.from("assets").update({ scheduled_at: at, approved: false }).eq("id", id)));
    }
    toast.success(`${plan.size} items dated. Review them, then approve.`);
    qc.invalidateQueries({ queryKey: ["assets"] });
  }

  async function approveReady() {
    const ids = unapprovedReady.map((a) => a.id);
    for (let i = 0; i < ids.length; i += 200) await supabase.from("assets").update({ approved: true }).in("id", ids.slice(i, i + 200));
    toast.success(`${ids.length} items approved.`);
    qc.invalidateQueries({ queryKey: ["assets"] });
  }

  async function doActivate() {
    setConfirm(false);
    const r = await activate();
    (r.ok ? toast.success : toast.error)(r.message);
    qc.invalidateQueries();
  }

  async function pause() {
    if (!settings) return;
    await supabase.from("settings").update({ publishing_active: false }).eq("user_id", settings.user_id);
    toast("Publishing paused. Nothing will be sent until you activate again.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const days = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { lead, list: Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`) };
  }, [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, typeof scheduled>();
    for (const a of scheduled) {
      const k = osloDateKey(a.scheduled_at!);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [scheduled]);
  const shiftMonth = (d: number) => {
    const [y, m] = month.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonth(t.toISOString().slice(0, 7));
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Calendar"
        subtitle="Step 3–4 · Assign dates, review once, then activate. Times are Oslo time and follow summer/winter time."
        actions={
          settings?.publishing_active ? (
            <Button variant="outline" onClick={pause}><PauseCircle /> Pause publishing</Button>
          ) : (
            <Button variant="hero" onClick={() => setConfirm(true)} disabled={!scheduled.length}><PlayCircle /> Activate</Button>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Plan" className="lg:col-span-1">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sd">Start date</Label>
              <Input id="sd" type="date" min={tomorrow} value={start} onChange={(e) => setStart(e.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="pt">Image post</Label>
                <Input id="pt" type="time" value={postTime} onChange={(e) => setPostTime(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rt">Reel</Label>
                <Input id="rt" type="time" value={reelTime} onChange={(e) => setReelTime(e.target.value)} className="h-11" />
              </div>
            </div>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Mix topics (from file names and your tags)</span>
              <Switch checked={mixing} onCheckedChange={setMixing} />
            </label>
            <Button variant="teal" className="w-full" onClick={() => apply("append")}><Wand2 /> Date new items</Button>
            <Button variant="outline" className="w-full" onClick={() => apply("reschedule")}>Re-plan all unpublished from start date</Button>
            {missed.length > 0 && (
              <Button variant="outline" className="w-full" onClick={() => apply("missed")}>Move {missed.length} missed to future slots</Button>
            )}
            <p className="text-xs text-muted-foreground">Published or partly published items keep their date. Missed items are never sent in a burst.</p>
          </div>
        </Panel>
        <Panel title="Review" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Dated</div><div className="font-display text-xl font-bold">{scheduled.length}</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Not ready</div><div className="font-display text-xl font-bold text-warning-foreground">{notReady.length}</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Approved</div><div className="font-display text-xl font-bold text-teal">{scheduled.filter((a) => a.approved).length}</div></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={approveReady} disabled={!unapprovedReady.length}><CheckCheck /> Approve {unapprovedReady.length} ready items</Button>
          </div>
          {notReady.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Items missing captions, uploads or audible Reel audio cannot be approved. Fix them in Library or Audio Studio.</p>}
          {scheduled.some((a) => a.seasonal) && <p className="mt-1 text-xs text-warning-foreground">Some items mention seasonal topics. Check their dates.</p>}
        </Panel>
      </div>

      <Tabs defaultValue="list" className="mt-6">
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          {!scheduled.length ? <Empty>No dates assigned yet.</Empty> : (
            <div className="divide-y rounded-xl border bg-card">
              {scheduled.map((a) => (
                <div key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="w-44 shrink-0 text-sm font-medium">{formatOslo(a.scheduled_at!)}</div>
                  <Badge variant={a.kind === "reel" ? "teal" : "muted"} className="w-fit">{a.kind === "reel" ? "Reel" : "Post"}</Badge>
                  <div className="min-w-0 flex-1 truncate text-sm">{a.file_name}</div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    {!a.approved && <Badge variant="warning">Not approved</Badge>}
                    {a.seasonal && <Badge variant="warning">Seasonal</Badge>}
                    <span className="text-muted-foreground">IG</span><PubBadge status={pubBy.get(a.id)?.instagram} />
                    <span className="text-muted-foreground">FB</span><PubBadge status={pubBy.get(a.id)?.facebook} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="month">
          <div className="mb-2 flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft /></Button>
            <span className="font-semibold">{new Date(month + "-01T12:00:00Z").toLocaleDateString("nb-NO", { month: "long", year: "numeric" })}</span>
            <Button size="icon" variant="ghost" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight /></Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"].map((d) => <div key={d} className="p-1 text-center font-semibold text-muted-foreground">{d}</div>)}
            {Array.from({ length: days.lead }).map((_, i) => <div key={`l${i}`} />)}
            {days.list.map((d) => (
              <div key={d} className="min-h-20 rounded-lg border bg-card p-1.5">
                <div className="text-muted-foreground">{Number(d.slice(8))}</div>
                {(byDay.get(d) ?? []).map((a) => (
                  <div key={a.id} className={`mt-1 truncate rounded px-1 py-0.5 ${a.kind === "reel" ? "bg-accent text-accent-foreground" : "bg-secondary"}`} title={a.file_name}>
                    {a.kind === "reel" ? "Reel" : "Post"}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start publishing?</AlertDialogTitle>
            <AlertDialogDescription>
              {conn?.status === "connected"
                ? `Approved items will be posted to Instagram and Facebook at their times, even when this page is closed. First: ${scheduled[0] ? formatOslo(scheduled[0].scheduled_at!) : "—"}.`
                : "Your Meta accounts are not connected yet. Connect them first under Connections."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doActivate} disabled={conn?.status !== "connected"}>Activate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
