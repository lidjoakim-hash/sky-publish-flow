<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Pure rules (CSV parsing, caption matching, Oslo scheduling, ZIP safety, audio levels) live in src/lib/*.ts without I/O and are covered by src/test/core-rules.test.ts — keeps behaviour testable.
- Import runs in the browser (src/lib/importer.ts): ZIPs are streamed entry-by-entry with fflate; never send archives to server functions — Workers have short limits and small memory.
- Publishing is a per-(asset, platform) state machine in src/lib/publisher.server.ts, claimed via the claim_publications DB lease; intent is persisted before each Meta write and interrupted sends become "unknown" — prevents double posts.
- publications and meta_connection are written only server-side (admin client); clients can only read them — status cannot be faked from the browser.
- FFmpeg probing/rendering runs in the local worker (worker/render-worker.mjs) via /api/public/worker/* guarded by WORKER_SECRET; originals in storage are never overwritten or deleted (no storage delete policy).
- Meta credentials are server secrets (META_PAGE_ACCESS_TOKEN, META_PAGE_ID, META_IG_USER_ID, optional META_GRAPH_VERSION), never stored in the database or browser.
- The cron route /api/public/cron/publish uses authenticateCronRequest; the cron job is created only when the user first activates publishing.
- Strategy rules (bucket vocabulary, keyword suggestions, source grouping) live in src/lib/strategy.ts; the strategy-aware planner is src/lib/planner.ts, wrapped by planWithStrategy in src/lib/plan.ts and covered by src/test/strategy-rules.test.ts — keeps rotation/cooldown/lock behaviour testable.
- Calendar plans are previewed client-side and committed only via the commitSchedule server function, which re-checks brand, locks, past slots and collisions — the browser cannot bypass planning safeguards.
- Assets carry brand_slug; planning, organizing, ideas and metrics are scoped per brand, and activatePublishing only enqueues the brand whose Meta secrets exist (skyline) — prevents posting one brand to another's accounts.
- metric_snapshots are separate from publications; clients may only write source manual/csv, meta_api rows come from the server — metrics can never alter publish status.
- Weight advice (src/lib/feedback.ts) uses medians, a minimum sample, bounded steps and a diversity floor, and is applied only by explicit owner action logged in strategy_changes.
- Idea briefs are template-based (src/lib/ideas.ts), stored in content_drafts, never overwrite assets.caption and are never scheduled.
