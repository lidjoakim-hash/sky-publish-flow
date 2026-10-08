import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { AUDIO_LABEL, type AudioState } from "@/lib/audio";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className, title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-card sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "teal" | "warn" | "danger" }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-bold", tone === "teal" && "text-teal", tone === "warn" && "text-warning-foreground", tone === "danger" && "text-destructive")}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function AudioBadge({ state }: { state: string }) {
  const s = (state in AUDIO_LABEL ? state : "unchecked") as AudioState;
  const v = s === "ready" || s === "existing" ? "success" : s === "silent" || s === "missing" ? "warning" : s === "failed" ? "danger" : s === "processing" ? "teal" : "muted";
  return <Badge variant={v}>{AUDIO_LABEL[s]}</Badge>;
}

const PUB_LABEL: Record<string, [string, "success" | "warning" | "danger" | "teal" | "muted"]> = { missed: ["Missed", "warning"],
  pending: ["Waiting", "muted"],
  needs_finish: ["Finish in Instagram", "warning"],
  sending: ["Sending", "teal"],
  processing: ["Processing at Meta", "teal"],
  publishing: ["Publishing", "teal"],
  retry: ["Will retry", "warning"],
  published: ["Published", "success"],
  failed: ["Failed", "danger"],
  unknown: ["Needs your check", "warning"],
  skipped: ["Skipped", "muted"],
};

export function PubBadge({ status }: { status?: string }) {
  if (!status) return <Badge variant="muted">Not queued</Badge>;
  const [l, v] = PUB_LABEL[status] ?? [status, "muted"];
  return <Badge variant={v}>{l}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
